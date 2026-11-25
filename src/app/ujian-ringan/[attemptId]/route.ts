import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  autoExpireCurrentSection,
  buildAttemptState,
} from "@/lib/toafl-exam";

// TOAFL — Jalur Ringan (25 Nov 2026): halaman ujian HTML polos untuk
// koneksi lambat. Tanpa bundle React/Next.js di sisi peserta: total
// unduhan ~15-25 KB (HTML + script kecil inline). Memakai API yang sama
// dengan halaman play (/api/exam/answer, /api/exam/submit-section,
// /api/exam/audio-play) sehingga jawaban + skor tercatat dengan cara
// yang sama. Yang dipotong: preload audio, wake lock, detektor
// pelanggaran (SIMULASI di jalur ini tidak kena auto-submit pelanggaran).

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = [
  "body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f4f4f5;color:#18181b;margin:0;padding:0}",
  ".wrap{max-width:720px;margin:0 auto;padding:12px 12px 40px}",
  ".top{position:sticky;top:0;z-index:10;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:8px}",
  ".top b{font-size:15px}",
  ".timer{font-size:18px;font-weight:800;color:#b45309;white-space:nowrap}",
  ".card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:14px;margin-bottom:12px}",
  ".muted{color:#71717a;font-size:13px}",
  ".qcontent{font-size:20px;line-height:2;margin:6px 0 10px}",
  ".opt{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid #e4e4e7;border-radius:10px;margin:6px 0;cursor:pointer}",
  ".opt input{margin-top:4px;flex:none}",
  ".opt .lbl{font-weight:800;flex:none}",
  ".opt .txt{font-size:17px;line-height:1.8;flex:1}",
  ".audio{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px;margin:8px 0}",
  ".audio .row{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}",
  ".abtn{background:#f59e0b;color:#451a03;border:none;border-radius:8px;padding:8px 12px;font-weight:700;font-size:13px;cursor:pointer}",
  ".abtn:disabled{background:#d4d4d8;color:#71717a;cursor:not-allowed}",
  ".submit{width:100%;background:#18181b;color:#fff;border:none;border-radius:12px;padding:14px;font-size:16px;font-weight:800;cursor:pointer;margin-top:8px}",
  ".submit:disabled{background:#a1a1aa;cursor:not-allowed}",
  ".link{color:#2563eb}",
  ".save{font-size:12px;color:#71717a;text-align:right;min-height:16px}",
  ".note{background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:10px;font-size:13px;margin-bottom:12px}",
].join("\n");

const SCRIPT = [
  "(function(){",
  "var data=document.getElementById('exam-data');",
  "if(!data) return;",
  "var attemptId=data.getAttribute('data-attempt-id');",
  "var remaining=parseInt(data.getAttribute('data-remaining'),10)||0;",
  "var timerEl=document.getElementById('timer');",
  "var statusEl=document.getElementById('save-status');",
  "var submitted=false;",
  "function fmt(s){var m=Math.floor(s/60);var r=s%60;return (m<10?'0':'')+m+':'+(r<10?'0':'')+r;}",
  "function submitSection(auto){",
  "if(submitted) return;",
  "if(!auto&&!window.confirm('Kumpulkan maharoh ini? Jawaban yang sudah dipilih akan dinilai.')) return;",
  "submitted=true;",
  "var b=document.getElementById('submit-btn');",
  "if(b){b.disabled=true;b.textContent='Mengumpulkan...';}",
  "fetch('/api/exam/submit-section',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId:attemptId})})",
  ".then(function(res){return res.json();})",
  ".then(function(st){if(st&&st.attempt&&st.attempt.status&&st.attempt.status!=='IN_PROGRESS'){window.location.href='/hasil/'+attemptId;}else{window.location.reload();}})",
  ".catch(function(){window.location.reload();});",
  "}",
  "function tick(){",
  "if(submitted) return;",
  "if(remaining<=0){submitSection(true);return;}",
  "if(timerEl) timerEl.textContent=fmt(remaining);",
  "remaining-=1;",
  "}",
  "if(timerEl) timerEl.textContent=fmt(remaining);",
  "setInterval(tick,1000);",
  "document.querySelectorAll('input.ans').forEach(function(r){",
  "r.addEventListener('change',function(){",
  "var qid=r.getAttribute('data-qid');",
  "if(statusEl) statusEl.textContent='Menyimpan...';",
  "fetch('/api/exam/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId:attemptId,questionId:qid,selectedOptionId:r.value})})",
  ".then(function(res){return res.json().then(function(j){return{ok:res.ok,j:j};});})",
  ".then(function(x){if(statusEl) statusEl.textContent=x.ok?'Tersimpan':'Gagal menyimpan: '+(x.j.error||'coba lagi');})",
  ".catch(function(){if(statusEl) statusEl.textContent='Gagal menyimpan (koneksi). Pilihan tetap tampil di layar.';});",
  "});",
  "});",
  "document.querySelectorAll('button.play-audio').forEach(function(btn){",
  "btn.addEventListener('click',function(){",
  "var qid=btn.getAttribute('data-qid');",
  "var url=btn.getAttribute('data-url');",
  "var aid=btn.getAttribute('data-audio-id');",
  "var cid=btn.getAttribute('data-count-id');",
  "var audio=aid?document.getElementById(aid):null;",
  "var countEl=cid?document.getElementById(cid):null;",
  "btn.disabled=true;",
  "fetch('/api/exam/audio-play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId:attemptId,questionId:qid,url:url})})",
  ".then(function(res){return res.json().then(function(j){return{ok:res.ok,j:j};});})",
  ".then(function(x){",
  "if(x.ok&&x.j.allowed){",
  "if(audio) audio.play();",
  "if(countEl) countEl.textContent='Diputar '+x.j.count+'/'+x.j.limit+'x';",
  "if(x.j.count>=x.j.limit){btn.disabled=true;btn.textContent='Batas putar habis';}else{btn.disabled=false;}",
  "}else{",
  "if(countEl) countEl.textContent=x.j.error||'Tidak bisa memutar';",
  "btn.disabled=true;",
  "}",
  "})",
  ".catch(function(){btn.disabled=false;if(countEl) countEl.textContent='Gagal (koneksi). Coba lagi.';});",
  "});",
  "});",
  "var sb=document.getElementById('submit-btn');",
  "if(sb) sb.addEventListener('click',function(){submitSection(false);});",
  "})();",
].join("\n");

function shell(title: string, body: string): string {
  return (
    "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n<meta charset=\"utf-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n" +
    "<title>" + esc(title) + "</title>\n<style>\n" + CSS + "\n</style>\n</head>\n" +
    "<body>\n<div class=\"wrap\">\n" + body + "\n</div>\n<script>\n" + SCRIPT + "\n</script>\n</body>\n</html>"
  );
}

function htmlResponse(html: string, status = 200): NextResponse {
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const owned = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, status: true },
  });
  if (!owned || owned.userId !== userSession.userId) {
    return htmlResponse(
      shell(
        "Tidak diizinkan",
        "<div class=\"card\"><h1>Ujian tidak ditemukan</h1>" +
          "<p class=\"muted\">Attempt ini bukan milik akun yang sedang login.</p>" +
          "<p><a class=\"link\" href=\"/exam\">Kembali ke Portal Ujian</a></p></div>"
      ),
      403
    );
  }

  // Penegakan timer dari server (sama seperti route state).
  if (owned.status === "IN_PROGRESS") {
    await autoExpireCurrentSection(attemptId);
  }

  const state = await buildAttemptState(attemptId);
  if (!state) {
    return htmlResponse(
      shell(
        "Tidak ditemukan",
        "<div class=\"card\"><h1>Attempt tidak ditemukan</h1>" +
          "<p><a class=\"link\" href=\"/exam\">Kembali ke Portal Ujian</a></p></div>"
      ),
      404
    );
  }

  // Attempt sudah selesai → arahkan ke hasil.
  if (state.attempt.status !== "IN_PROGRESS") {
    return htmlResponse(
      shell(
        "Ujian Selesai",
        "<div class=\"card\"><h1>Ujian ini sudah selesai</h1>" +
          "<p class=\"muted\">Status: " + esc(state.attempt.status) + "</p>" +
          "<p><a class=\"link\" href=\"/hasil/" + esc(attemptId) + "\">Lihat Hasil</a> &nbsp;·&nbsp; " +
          "<a class=\"link\" href=\"/exam\">Kembali ke Portal Ujian</a></p></div>"
      )
    );
  }

  const current = state.currentSection;
  if (!current) {
    return htmlResponse(
      shell(
        "Ujian",
        "<div class=\"card\"><h1>Tidak ada maharoh yang sedang berjalan</h1>" +
          "<p class=\"muted\">Coba muat ulang halaman ini.</p>" +
          "<p><a class=\"link\" href=\"/ujian-ringan/" + esc(attemptId) + "\">Muat ulang</a> &nbsp;·&nbsp; " +
          "<a class=\"link\" href=\"/exam\">Kembali ke Portal Ujian</a></p></div>"
      )
    );
  }

  const maharohCfg = state.exam.maharohs.find(
    (m) => m.id === current.maharohId
  );
  const limit = maharohCfg?.audioRepeats ?? 2;
  const sectionIdx = state.exam.maharohs.findIndex(
    (m) => m.id === current.maharohId
  );
  const remainingSeconds = Math.max(
    0,
    Math.floor(
      (new Date(current.expiresAt).getTime() -
        new Date(state.serverTime).getTime()) /
        1000
    )
  );

  // Kelompok audio bersama (sama seperti play page): nomor soal 1-based.
  const audioGroups = new Map<
    string,
    { index: number; from: number; to: number; count: number }
  >();
  current.questions.forEach((q, i) => {
    if (!q.audioUrl) return;
    const existing = audioGroups.get(q.audioUrl);
    if (existing) {
      existing.to = i + 1;
      existing.count += 1;
    } else {
      audioGroups.set(q.audioUrl, {
        index: audioGroups.size + 1,
        from: i + 1,
        to: i + 1,
        count: 1,
      });
    }
  });

  const answers = new Map(
    state.answers.map((a) => [a.questionId, a] as const)
  );

  const questionsHtml = current.questions
    .map((q, qi) => {
      const num = qi + 1;
      const ans = answers.get(q.id);
      const selected = ans?.selectedOptionId ?? null;
      const played = ans?.audioPlayCount ?? 0;
      const group = q.audioUrl ? audioGroups.get(q.audioUrl) : undefined;
      const shared = group && group.count > 1;

      const audioBlock = q.audioUrl
        ? "<div class=\"audio\">" +
          "<div class=\"row\"><span><b>Audio " + (group?.index ?? num) + "</b>" +
          (shared
            ? " · Audio bersama · untuk Soal " + group.from + "-" + group.to
            : "") +
          "</span><span id=\"cnt-" + esc(q.id) + "\">Diputar " + played + "/" + limit + "x</span></div>" +
          "<div style=\"margin-top:8px\">" +
          "<button type=\"button\" class=\"abtn play-audio\" data-qid=\"" + esc(q.id) + "\" " +
          "data-url=\"" + esc(q.audioUrl) + "\" data-audio-id=\"au-" + esc(q.id) + "\" " +
          "data-count-id=\"cnt-" + esc(q.id) + "\"" +
          (played >= limit ? " disabled" : "") + ">▶ Putar Audio</button></div>" +
          "<audio id=\"au-" + esc(q.id) + "\" src=\"" + esc(q.audioUrl) + "\" preload=\"none\"></audio>" +
          "</div>"
        : "";

      const optionsHtml = q.options
        .map((o) => {
          const optAudio =
            o.contentType === "AUDIO" && o.audioUrl
              ? "<button type=\"button\" class=\"abtn play-audio\" data-qid=\"" + esc(q.id) + "\" " +
                "data-url=\"" + esc(o.audioUrl) + "\" data-audio-id=\"au-opt-" + esc(o.id) + "\" " +
                "data-count-id=\"\">▶</button>" +
                "<audio id=\"au-opt-" + esc(o.id) + "\" src=\"" + esc(o.audioUrl) + "\" preload=\"none\"></audio>"
              : "";
          return (
            "<label class=\"opt\">" +
            "<input type=\"radio\" class=\"ans\" name=\"q-" + esc(q.id) + "\" " +
            "value=\"" + esc(o.id) + "\" data-qid=\"" + esc(q.id) + "\"" +
            (selected === o.id ? " checked" : "") + ">" +
            "<span class=\"lbl\">" + esc(o.label) + ".</span>" +
            "<span class=\"txt\" dir=\"" + (o.direction === "RTL" ? "rtl" : "ltr") + "\">" +
            esc(o.content) +
            "</span>" +
            optAudio +
            "</label>"
          );
        })
        .join("\n");

      return (
        "<div class=\"card\">" +
        "<div class=\"muted\">Soal " + num + " dari " + current.questions.length + "</div>" +
        "<div class=\"qcontent\" dir=\"" + (q.direction === "RTL" ? "rtl" : "ltr") + "\">" +
        esc(q.content) +
        "</div>" +
        audioBlock +
        optionsHtml +
        "</div>"
      );
    })
    .join("\n");

  const body =
    "<div id=\"exam-data\" data-attempt-id=\"" + esc(attemptId) + "\" " +
    "data-remaining=\"" + remainingSeconds + "\"></div>" +
    "<div class=\"top\"><b>" + esc(state.exam.title) + "</b>" +
    "<span class=\"timer\" id=\"timer\">--:--</span></div>" +
    "<div class=\"card\"><b>" + esc(current.maharohName) + "</b> " +
    "<span class=\"muted\">· Maharoh " + (sectionIdx + 1) + " dari " + state.exam.maharohs.length +
    " · " + current.questions.length + " soal</span>" +
    "<div class=\"save\" id=\"save-status\"></div></div>" +
    "<div class=\"note\">Versi ringan untuk koneksi lambat. Jawaban tersimpan " +
    "otomatis saat dipilih. Halaman ini tidak memakai detektor pelanggaran " +
    "dan tidak memuat audio sebelum ditekan putar.</div>" +
    questionsHtml +
    "<button type=\"button\" class=\"submit\" id=\"submit-btn\">Kumpulkan " +
    esc(current.maharohName) + "</button>" +
    "<p style=\"text-align:center\"><a class=\"link\" href=\"/exam\">Kembali ke Portal Ujian</a></p>";

  return htmlResponse(shell(state.exam.title + " — " + current.maharohName, body));
}
