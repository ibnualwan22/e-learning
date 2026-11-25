import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  autoExpireCurrentSection,
  buildAttemptState,
} from "@/lib/toafl-exam";

// TOAFL — Jalur Ringan (25 Nov 2026): halaman ujian HTML polos untuk
// koneksi lambat. Tanpa bundle React/Next.js di sisi peserta: total
// unduhan puluhan KB (HTML + script kecil inline). Memakai API yang sama
// dengan halaman play (/api/exam/answer, /api/exam/submit-section,
// /api/exam/audio-play, /api/exam/violation, /api/exam/state) sehingga
// jawaban + skor + pelanggaran tercatat dengan cara yang sama.
//
// Tampilan dibuat persis seperti halaman play asli: top bar gelap +
// timer + Kumpulkan, satu soal per layar dengan navigasi Sebelumnya /
// Selanjutnya, grid nomor soal (sidebar desktop + lembar bawah HP),
// tombol Ragu-ragu, pengatur ukuran huruf, modal konfirmasi kumpulkan.
// Fullscreen (SIMULASI) + auto-submit pelanggaran aktif sama seperti
// versi asli. Yang dipotong: preload audio (hanya metadata untuk label
// durasi), wake lock, dan bundle framework.

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAudioDuration(sec: number | undefined): string | null {
  if (sec === undefined || !Number.isFinite(sec) || sec <= 0) return null;
  if (sec < 60) return "±" + Math.round(sec) + " dtk";
  return "±" + Math.round(sec / 60) + " mnt";
}

const CSS = `
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f4f4f5;color:#18181b;margin:0;padding:0}
.app{height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:#f4f4f5}
.topbar{flex:none;background:#18181b;color:#fff;border-bottom:1px solid #27272a;box-shadow:0 4px 6px -1px rgba(0,0,0,.1)}
.topbar-in{max-width:1280px;margin:0 auto;padding:0 16px;height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.topbar h1{font-weight:700;font-size:14px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topbar .sub{display:flex;align-items:center;gap:12px;font-size:12px;color:#fcd34d;margin-top:2px;white-space:nowrap;overflow:hidden}
.topbar .sub span{overflow:hidden;text-overflow:ellipsis}
.topbar .right{display:flex;align-items:center;gap:12px;flex:none}
.timer{font-family:ui-monospace,Menlo,monospace;font-weight:900;font-size:16px;padding:8px 16px;border-radius:12px;background:rgba(39,39,42,.9);color:#fcd34d;border:1px solid rgba(251,191,36,.3);display:flex;align-items:center;gap:8px;white-space:nowrap}
.timer.low{background:#dc2626;color:#fff;border-color:#f87171;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
.kumpul{background:#fbbf24;color:#09090b;font-weight:700;border-radius:12px;padding:10px 16px;font-size:12px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.kumpul:hover{background:#fcd34d}
main{flex:1;min-height:0;max-width:1280px;width:100%;margin:0 auto;padding:16px;display:grid;grid-template-columns:1fr;gap:24px}
.qcol{display:flex;flex-direction:column;gap:16px;min-height:0}
.qcard{background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;flex:1;min-height:0;display:flex;flex-direction:column}
.qscroll{flex:1;min-height:0;overflow-y:auto}
.qhead{position:sticky;top:0;z-index:10;padding:16px 24px;background:#fafafa;border-bottom:1px solid #e4e4e7;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
.badge-no{background:#18181b;color:#fff;border-radius:8px;padding:4px 12px;font-weight:700;font-size:12px}
.badge-m{background:#fffbeb;border:1px solid #fde68a;color:#78350f;border-radius:8px;padding:4px 10px;font-weight:600;font-size:12px}
.fontadj{display:flex;align-items:center;gap:4px;background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:4px}
.fontadj button{padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;border:none;background:transparent;color:#52525b;cursor:pointer}
.fontadj button.on{background:#18181b;color:#fff}
.qbody{padding:24px}
.qcontent{padding:24px;border-radius:12px;background:rgba(255,251,235,.4);border:1px solid rgba(253,230,138,.6);color:#18181b;white-space:pre-line}
.qcontent[dir="rtl"]{font-family:'Amiri','Traditional Arabic',serif;text-align:right}
body[data-font="normal"] .qcontent[dir="rtl"]{font-size:20px;line-height:2}
body[data-font="large"] .qcontent[dir="rtl"]{font-size:24px;line-height:2}
body[data-font="xlarge"] .qcontent[dir="rtl"]{font-size:30px;line-height:2}
body[data-font="normal"] .qcontent[dir="ltr"]{font-size:16px;line-height:1.8}
body[data-font="large"] .qcontent[dir="ltr"]{font-size:20px;line-height:1.8}
body[data-font="xlarge"] .qcontent[dir="ltr"]{font-size:24px;line-height:1.8}
/* Teks bacaan Qira'ah — kartu lipat di atas soal; isi bisa di-scroll. */
.passage{flex:none;background:#fff;border:1px solid #a7f3d0;border-radius:12px;overflow:hidden}
.passage summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;cursor:pointer;list-style:none;background:#ecfdf5;font-weight:700;font-size:14px;color:#065f46}
.passage summary::-webkit-details-marker{display:none}
.passage summary .tag{padding:2px 8px;border-radius:999px;background:#d1fae5;border:1px solid #6ee7b7;color:#065f46;font-size:12px;font-weight:600}
.passage summary .chev{transition:transform .2s;font-size:12px}
.passage[open ] summary .chev{transform:rotate(180deg)}
.passage .pbody{max-height:288px;overflow-y:auto;padding:20px 24px;border-top:1px solid #a7f3d0;background:#fff}
.passage .ptext{font-family:'Amiri','Traditional Arabic',serif;text-align:right;direction:rtl;white-space:pre-line;line-height:2;color:#18181b}
body[data-font="normal"] .passage .ptext{font-size:20px}
body[data-font="large"] .passage .ptext{font-size:24px}
body[data-font="xlarge"] .passage .ptext{font-size:30px}
@media(min-width:640px){.passage .pbody{max-height:384px}}
body[data-font="normal"] .opt .txt[dir="rtl"]{font-size:18px;line-height:1.8}
body[data-font="large"] .opt .txt[dir="rtl"]{font-size:20px;line-height:1.8}
body[data-font="xlarge"] .opt .txt[dir="rtl"]{font-size:24px;line-height:1.8}
body[data-font="normal"] .opt .txt[dir="ltr"]{font-size:14px;line-height:1.6}
body[data-font="large"] .opt .txt[dir="ltr"]{font-size:16px;line-height:1.6}
body[data-font="xlarge"] .opt .txt[dir="ltr"]{font-size:20px;line-height:1.6}
.audio{margin-top:16px;padding:16px;border-radius:12px;border:1px solid #e4e4e7;background:#fafafa}
.audio .meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:#52525b}
.audio .meta b{color:#18181b}
.audio .pill{padding:2px 8px;border-radius:999px;background:#fef3c7;border:1px solid #fcd34d;color:#78350f;font-weight:600}
.audio .row{display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap}
.abtn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;background:#18181b;color:#fff;font-size:12px;font-weight:700;border:none;cursor:pointer}
.abtn:hover{background:#27272a}
.abtn:disabled{opacity:.4;cursor:not-allowed}
.abtn.sm{padding:8px 12px;border-radius:8px}
.opts{margin-top:24px;display:flex;flex-direction:column;gap:12px}
.opt{display:flex;align-items:center;gap:16px;width:100%;padding:16px;border-radius:12px;border:2px solid #e4e4e7;background:#fff;text-align:left;transition:border-color .15s,background .15s}
.opt:hover{border-color:#fcd34d}
.opt.sel{border-color:#f59e0b;background:rgba(255,251,235,.7);box-shadow:0 1px 2px rgba(0,0,0,.05)}
.opt-main{display:flex;align-items:center;gap:16px;flex:1;text-align:left;background:none;border:none;padding:0;cursor:pointer;font:inherit;color:inherit}
.opt-main:disabled{opacity:.4;cursor:not-allowed}
.opt .lbl{width:36px;height:36px;border-radius:12px;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;flex:none;background:#f4f4f5;color:#3f3f46}
.opt.sel .lbl{background:#18181b;color:#fff}
.opt .txt{flex:1;color:#27272a}
.opt .txt[dir="rtl"]{font-family:'Amiri','Traditional Arabic',serif;text-align:right}
.bottomnav{flex:none;padding:16px 24px;background:#fafafa;border-top:1px solid #e4e4e7;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
.btn{padding:10px 16px;border-radius:12px;font-weight:600;font-size:12px;cursor:pointer;border:1px solid transparent;display:inline-flex;align-items:center;gap:6px;background:#fff}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-prev{border-color:#d4d4d8;color:#3f3f46}
.btn-prev:hover{background:#f4f4f5}
.btn-doubt{background:#fffbeb;color:#92400e;border-color:#fcd34d}
.btn-doubt:hover{background:#fef3c7}
.btn-doubt.on{background:#fbbf24;color:#09090b;border-color:#f59e0b}
.btn-next{background:#18181b;color:#fff}
.btn-next:hover{background:#27272a}
.btn-submit{background:#f59e0b;color:#09090b;font-weight:700}
.btn-submit:hover{background:#fbbf24}
.btn-num{border-color:#d4d4d8;color:#3f3f46}
.side{display:none;min-height:0;overflow-y:auto}
.side .card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:20px;margin-bottom:16px}
.side h2{font-weight:700;font-size:14px;color:#18181b;margin:0 0 12px}
.mrow{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:8px;border:1px solid #e4e4e7;background:#fafafa;font-size:14px;margin-bottom:8px}
.mrow.cur{border-color:#f59e0b;background:rgba(255,251,235,.7)}
.mrow .nm{font-weight:600;color:#27272a;display:flex;align-items:center;gap:8px}
.mrow .st{font-size:12px;color:#71717a}
.dot{width:8px;height:8px;border-radius:50%;flex:none}
.dot.g{background:#059669}.dot.a{background:#d97706}.dot.z{background:#a1a1aa}
.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.nbtn{height:44px;border-radius:12px;font-weight:700;font-size:12px;border:2px solid #e4e4e7;background:#f4f4f5;color:#3f3f46;cursor:pointer;display:flex;align-items:center;justify-content:center}
.nbtn.answered{background:#18181b;color:#fff;border-color:#27272a}
.nbtn.doubt{background:#fbbf24;color:#09090b;border-color:#f59e0b}
.nbtn.cur{box-shadow:0 0 0 2px #fff,0 0 0 4px #f59e0b}
.legend{margin-top:20px;padding-top:16px;border-top:1px solid #f4f4f5;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;color:#52525b}
.legend .sw{width:12px;height:12px;border-radius:4px;display:inline-block;vertical-align:-1px;margin-right:6px}
.notice{border-radius:12px;padding:12px 16px;font-size:14px;margin-bottom:12px}
.notice-red{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
.notice-amber{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
.notice .x{float:right;font-weight:700;text-decoration:underline;background:none;border:none;color:inherit;cursor:pointer;font-size:12px}
.sheet{position:fixed;inset:0;z-index:50;display:none}
.sheet.open{display:block}
.sheet-bg{position:absolute;inset:0;background:rgba(9,9,11,.6)}
.sheet-box{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:16px 16px 0 0;padding:20px;max-height:70dvh;overflow-y:auto;box-shadow:0 -10px 30px rgba(0,0,0,.25)}
.sheet-box h2{font-weight:700;font-size:14px;margin:0 0 12px}
.modal{position:fixed;inset:0;z-index:50;background:rgba(9,9,11,.6);display:none;align-items:center;justify-content:center;padding:16px}
.modal.open{display:flex}
.modal-box{background:#fff;border-radius:12px;max-width:448px;width:100%;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);border:1px solid #e4e4e7}
.modal-box h3{font-size:18px;font-weight:700;color:#18181b;margin:0}
.modal-box p{font-size:14px;color:#52525b}
.modal-box .red{color:#dc2626;font-weight:500}
.modal-box .amber{color:#b45309;font-weight:500}
.modal-box .row{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:12px}
.mbtn{padding:10px 20px;border-radius:12px;font-weight:700;font-size:12px;cursor:pointer;border:none}
.mbtn.ghost{background:#f4f4f5;color:#3f3f46}
.mbtn.dark{background:#18181b;color:#fff}
.mbtn:disabled{opacity:.5;cursor:not-allowed}
.center-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;text-align:center;max-width:480px;margin:40px auto}
.link{color:#2563eb}
.hidden{display:none}
@media(min-width:640px){.topbar h1{font-size:16px}.timer{font-size:18px}.qbody{padding:32px}}
@media(min-width:1024px){main{grid-template-columns:repeat(12,1fr);padding:24px}.qcol{grid-column:span 8}.side{display:block;grid-column:span 4}.btn-num{display:none}}
`;

// Kontroler halaman (vanilla JS, tanpa framework). Sengaja ditulis tanpa
// backtick / ${} supaya aman di dalam template literal TypeScript.
const SCRIPT = [
  "(function(){",
  "var J=JSON.parse(document.getElementById('exam-json').textContent);",
  "var attemptId=J.attemptId, sectionId=J.sectionId, mode=J.mode, audioLimit=J.audioLimit, total=J.total;",
  "var answers=J.answers||{};",
  "var cur=0, fontScale='normal', isFullscreen=false, fullscreenSupported=false;",
  "var violationSuppressed=false, lastViolationAt=0, violationReported={}, autoSubmitDone=false, isTimeUp=false, submitted=false, playingUrl=null;",
  "var remaining=J.remaining||0;",
  "var LSKEY='toafl-answers:'+attemptId;",
  "function el(id){return document.getElementById(id);}",
  "function fmt(s){var m=Math.floor(s/60),r=s%60;return (m<10?'0':'')+m+':'+(r<10?'0':'')+r;}",
  "function readLocal(){try{return JSON.parse(localStorage.getItem(LSKEY)||'{}');}catch(e){return{};}}",
  "function writeLocal(d){try{localStorage.setItem(LSKEY,JSON.stringify(d));}catch(e){}}",
  "function counts(){var a=0,d=0;for(var k in answers){if(answers[k].selectedOptionId)a++;if(answers[k].isDoubtful)d++;}return{answered:a,doubtful:d};}",
  "function updateTop(){var c=counts();var t=el('top-answered');if(t)t.textContent='Terjawab: '+c.answered+'/'+total;var s=el('top-saving');if(s)s.textContent=savingText;}",
  "var savingText='Tersimpan otomatis';",
  "function setSaving(t){savingText=t;var s=el('top-saving');if(s)s.textContent=t;}",
  "function updateGrid(){var btns=document.querySelectorAll('.nbtn');for(var i=0;i<btns.length;i++){var b=btns[i];var idx=parseInt(b.getAttribute('data-idx'),10);var qid=b.getAttribute('data-qid');var a=answers[qid];b.classList.toggle('doubt',!!(a&&a.isDoubtful));b.classList.toggle('answered',!!(a&&a.selectedOptionId)&&!(a&&a.isDoubtful));b.classList.toggle('cur',idx===cur);}}",
  "function updateDoubtBtn(){var q=J.questions[cur];var a=answers[q.id];var b=el('doubt-btn');if(!b)return;var on=!!(a&&a.isDoubtful);b.classList.toggle('on',on);b.querySelector('span').textContent=on?'Ditandai Ragu-ragu':'Ragu-ragu';}",
  "function updateNav(){var prev=el('prev-btn'),next=el('next-btn'),sub=el('submit-btn-bottom');if(prev)prev.disabled=(cur===0);if(next)next.classList.toggle('hidden',cur>=total-1);if(sub)sub.classList.toggle('hidden',cur<total-1);var so=el('top-soal');if(so)so.textContent='Soal '+(cur+1)+'/'+total;}",
  "function showQuestion(i){if(i<0)i=0;if(i>total-1)i=total-1;cur=i;var cards=document.querySelectorAll('.qcard');for(var k=0;k<cards.length;k++){cards[k].classList.toggle('hidden',k!==cur);}var vis=document.querySelector('.qcard:not(.hidden) .qscroll');if(vis)vis.scrollTop=0;updateGrid();updateDoubtBtn();updateNav();}",
  "function saveAnswer(qid,oid,doubtful){var a=answers[qid]||{selectedOptionId:null,isDoubtful:false,audioPlayCount:0};a.selectedOptionId=oid;a.isDoubtful=doubtful;answers[qid]=a;var local=readLocal();local[qid]={selectedOptionId:oid,isDoubtful:doubtful,saved:false,updatedAt:Date.now()};writeLocal(local);setSaving('Menyimpan...');fetch('/api/exam/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId:attemptId,questionId:qid,selectedOptionId:oid,isDoubtful:doubtful})}).then(function(res){return res.json().then(function(j){return{ok:res.ok,j:j};});}).then(function(x){if(x.ok){var l2=readLocal();if(l2[qid]&&l2[qid].selectedOptionId===oid&&l2[qid].isDoubtful===doubtful){l2[qid].saved=true;writeLocal(l2);}setSaving('Tersimpan otomatis');}else{if(x.j&&x.j.timeUp){location.reload();return;}setSaving('Gagal simpan, mencoba ulang otomatis');}}).catch(function(){setSaving('Gagal simpan, mencoba ulang otomatis');});updateTop();updateGrid();}",
  "function flushPending(){var local=readLocal();var keys=Object.keys(local).filter(function(k){return local[k]&&!local[k].saved;});if(keys.length===0)return;keys.forEach(function(qid){var e=local[qid];fetch('/api/exam/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId:attemptId,questionId:qid,selectedOptionId:e.selectedOptionId,isDoubtful:e.isDoubtful})}).then(function(res){if(res.ok){var l2=readLocal();if(l2[qid]){l2[qid].saved=true;writeLocal(l2);}}}).catch(function(){});});}",
  "function selectOption(qid,oid,card){var a=answers[qid]||{selectedOptionId:null,isDoubtful:false,audioPlayCount:0};var doubtful=a.isDoubtful;var wrap=card.parentElement;var sibs=wrap.querySelectorAll('.opt');for(var i=0;i<sibs.length;i++)sibs[i].classList.remove('sel');card.classList.add('sel');saveAnswer(qid,oid,doubtful);}",
  "function toggleDoubt(){var q=J.questions[cur];var a=answers[q.id]||{selectedOptionId:null,isDoubtful:false,audioPlayCount:0};saveAnswer(q.id,a.selectedOptionId,!a.isDoubtful);updateDoubtBtn();}",
  "function setFont(scale){fontScale=scale;document.body.setAttribute('data-font',scale);var btns=document.querySelectorAll('.fontadj button');for(var i=0;i<btns.length;i++){btns[i].classList.toggle('on',btns[i].getAttribute('data-scale')===scale);}}",
  "function refreshPlayButtons(){var btns=document.querySelectorAll('button.play-audio');for(var i=0;i<btns.length;i++){var b=btns[i];var qid=b.getAttribute('data-qid');var a=answers[qid];var cnt=a?a.audioPlayCount:0;b.disabled=(playingUrl!==null)||(cnt>=audioLimit);}}",
  "function playAudio(qid,url,audioId,countId,btn){if(playingUrl)return;var origText=btn.textContent;btn.disabled=true;fetch('/api/exam/audio-play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId:attemptId,questionId:qid,url:url})}).then(function(res){return res.json().then(function(j){return{ok:res.ok,j:j};});}).then(function(x){if(x.ok&&x.j.allowed){var au=el(audioId);var a=answers[qid];if(a)a.audioPlayCount=x.j.count;var c=el(countId);if(c)c.textContent='Diputar '+x.j.count+'/'+x.j.limit+'x';if(au){au.currentTime=0;playingUrl=url;refreshPlayButtons();btn.textContent='Memutar...';var done=function(){playingUrl=null;refreshPlayButtons();btn.textContent=origText;};au.onended=done;au.onerror=function(){playingUrl=null;refreshPlayButtons();btn.textContent=origText;showAudioError('Audio gagal diputar. Periksa koneksi lalu coba lagi.');};au.play().catch(function(){playingUrl=null;refreshPlayButtons();btn.textContent=origText;showAudioError('Audio gagal diputar. Periksa koneksi lalu coba lagi.');});}else{refreshPlayButtons();}}else{var c2=el(countId);if(c2&&x.j.error)c2.textContent=x.j.error;showAudioError(x.j.error||'Batas pengulangan audio sudah habis untuk soal ini.');refreshPlayButtons();}}).catch(function(){btn.disabled=false;showAudioError('Gagal menghubungi server. Coba lagi.');});}",
  "function showAudioError(msg){var n=el('audio-error');if(n){n.textContent=msg;n.classList.remove('hidden');}}",
  "function submitSection(auto){if(submitted)return;if(!auto){openConfirm();return;}submitted=true;var b=el('submit-btn-bottom');if(b){b.disabled=true;b.textContent='Mengumpulkan...';}fetch('/api/exam/submit-section',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId:attemptId})}).then(function(res){return res.json();}).then(function(st){if(st&&st.attempt&&st.attempt.status&&st.attempt.status!=='IN_PROGRESS'){if(document.fullscreenElement&&document.exitFullscreen){try{document.exitFullscreen();}catch(e){}}try{localStorage.removeItem(LSKEY);}catch(e){}location.href='/hasil/'+attemptId;}else{location.reload();}}).catch(function(){location.reload();});}",
  "function openConfirm(){var c=counts();var a=el('m-answered');if(a)a.textContent=c.answered+' dari '+total+' soal';var u=el('m-unanswered');if(u){if(total-c.answered>0){u.textContent='Masih ada '+(total-c.answered)+' soal yang belum dijawab!';u.classList.remove('hidden');}else{u.classList.add('hidden');}}var d=el('m-doubtful');if(d){if(c.doubtful>0){d.textContent='Masih ada '+c.doubtful+' soal yang ditandai Ragu-ragu.';d.classList.remove('hidden');}else{d.classList.add('hidden');}}el('confirm-modal').classList.add('open');}",
  "function closeConfirm(){el('confirm-modal').classList.remove('open');}",
  "function tick(){if(submitted)return;if(remaining<=0){isTimeUp=true;var n=el('timeup-notice');if(n)n.classList.remove('hidden');if(!autoSubmitDone){autoSubmitDone=true;violationSuppressed=true;setTimeout(function(){submitSection(true);},500);}return;}var t=el('timer');if(t){t.textContent=fmt(remaining);t.classList.toggle('low',remaining<300);}remaining-=1;}",
  "function enterFullscreen(){var d=document.documentElement;if(d.requestFullscreen){d.requestFullscreen().catch(function(){});}}",
  "function reportViolation(type,detail,useBeacon){if(violationSuppressed)return;var now=Date.now();if(now-lastViolationAt<2000)return;lastViolationAt=now;var key=sectionId+':'+type;if(violationReported[key])return;violationReported[key]=true;var payload=JSON.stringify({attemptId:attemptId,type:type,detail:detail});if(useBeacon&&navigator.sendBeacon){navigator.sendBeacon('/api/exam/violation',new Blob([payload],{type:'application/json'}));return;}fetch('/api/exam/violation',{method:'POST',headers:{'Content-Type':'application/json'},body:payload}).then(function(res){return res.json().catch(function(){return{};});}).then(function(data){if(data&&data.autoSubmitted){var n=el('violation-notice');var msg=el('violation-text');if(n&&msg){msg.textContent=(type==='BLUR'?'Maharoh ditutup otomatis karena jendela ujian kehilangan fokus — lanjut ke maharoh berikut.':'Maharoh ditutup otomatis karena terdeteksi pindah tab — lanjut ke maharoh berikut.');n.classList.remove('hidden');}setTimeout(function(){location.reload();},2000);}if(data&&data.warn){var w=el('warn-notice');var wt=el('warn-text');if(w&&wt){wt.textContent=(type==='BLUR'?'Peringatan: jendela ujian sempat kehilangan fokus. Ini peringatan pertama untuk maharoh ini — bila terulang, maharoh akan ditutup otomatis. Waktu tetap berjalan.':'Peringatan: terdeteksi pindah tab. Ini peringatan pertama untuk maharoh ini — bila terulang, maharoh akan ditutup otomatis. Waktu tetap berjalan.');w.classList.remove('hidden');}for(var k in violationReported){if(k.indexOf(sectionId+':')===0)delete violationReported[k];}}}).catch(function(){});}",
  "function init(){",
  "var t=el('timer');if(t)t.textContent=fmt(remaining);",
  "setInterval(tick,1000);",
  "var audios=document.querySelectorAll('audio.au-q');for(var i=0;i<audios.length;i++){audios[i].addEventListener('loadedmetadata',function(){var dur=this.duration;var span=el('dur-'+this.getAttribute('data-qid'));if(span&&isFinite(dur)&&dur>0){span.textContent=dur<60?('· Durasi ±'+Math.round(dur)+' dtk'):('· Durasi ±'+Math.round(dur/60)+' mnt');}});}",
  "document.querySelectorAll('.opt-main').forEach(function(b){b.addEventListener('click',function(){var card=b.closest('.opt');var qid=b.getAttribute('data-qid');var oid=b.getAttribute('data-oid');if(isTimeUp)return;selectOption(qid,oid,card);});});",
  "document.querySelectorAll('.fontadj button').forEach(function(b){b.addEventListener('click',function(){setFont(b.getAttribute('data-scale'));});});",
  "document.querySelectorAll('.nbtn').forEach(function(b){b.addEventListener('click',function(){showQuestion(parseInt(b.getAttribute('data-idx'),10));var sh=el('number-sheet');if(sh)sh.classList.remove('open');});});",
  "document.querySelectorAll('button.play-audio').forEach(function(btn){btn.addEventListener('click',function(){playAudio(btn.getAttribute('data-qid'),btn.getAttribute('data-url'),btn.getAttribute('data-audio-id'),btn.getAttribute('data-count-id'),btn);});});",
  "var prev=el('prev-btn');if(prev)prev.addEventListener('click',function(){showQuestion(cur-1);});",
  "var next=el('next-btn');if(next)next.addEventListener('click',function(){showQuestion(cur+1);});",
  "var db=el('doubt-btn');if(db)db.addEventListener('click',function(){if(!isTimeUp)toggleDoubt();});",
  "var nb=el('num-btn');if(nb)nb.addEventListener('click',function(){el('number-sheet').classList.add('open');});",
  "var sc=el('sheet-close');if(sc)sc.addEventListener('click',function(){el('number-sheet').classList.remove('open');});",
  "var sb=el('sheet-bg');if(sb)sb.addEventListener('click',function(){el('number-sheet').classList.remove('open');});",
  "var kb=el('kumpul-top');if(kb)kb.addEventListener('click',function(){openConfirm();});",
  "var sb2=el('submit-btn-bottom');if(sb2)sb2.addEventListener('click',function(){submitSection(false);});",
  "var cc=el('confirm-cancel');if(cc)cc.addEventListener('click',function(){closeConfirm();});",
  "var cy=el('confirm-yes');if(cy)cy.addEventListener('click',function(){closeConfirm();submitSection(true);});",
  "var vc=el('violation-close');if(vc)vc.addEventListener('click',function(){el('violation-notice').classList.add('hidden');});",
  "var wc=el('warn-close');if(wc)wc.addEventListener('click',function(){el('warn-notice').classList.add('hidden');});",
  "var fb=el('fs-btn');if(fb)fb.addEventListener('click',function(){enterFullscreen();});",
  "document.addEventListener('fullscreenchange',function(){isFullscreen=!!document.fullscreenElement;var ban=el('fs-banner');if(ban){var show=(mode==='SIMULASI'&&fullscreenSupported&&!isFullscreen);ban.classList.toggle('hidden',!show);}});",
  "fullscreenSupported=('requestFullscreen' in document.documentElement);",
  "isFullscreen=!!document.fullscreenElement;",
  "var ban0=el('fs-banner');if(ban0){ban0.classList.toggle('hidden',!(mode==='SIMULASI'&&fullscreenSupported&&!isFullscreen));}",
  "document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'){reportViolation('TAB_CLOSE','Tab disembunyikan / pindah tab',false);}});",
  "window.addEventListener('blur',function(){reportViolation('BLUR','Jendela ujian kehilangan fokus',false);});",
  "window.addEventListener('pagehide',function(){reportViolation('TAB_CLOSE','Tab ditutup',true);});",
  "window.addEventListener('online',function(){flushPending();});",
  "document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'){flushPending();}});",
  "setInterval(function(){flushPending();},30000);",
  "setInterval(function(){fetch('/api/exam/state?attemptId='+attemptId).then(function(r){return r.json();}).then(function(data){if(!data||!data.attempt)return;if(data.attempt.status!=='IN_PROGRESS'){location.reload();return;}if(data.currentSection&&data.currentSection.id!==sectionId){location.reload();}}).catch(function(){});},30000);",
  "function markSelected(qid,oid){var mains=document.querySelectorAll('.opt-main[data-qid=\"'+qid+'\"]');for(var i=0;i<mains.length;i++){var card=mains[i].closest('.opt');if(!card)continue;card.classList.toggle('sel',mains[i].getAttribute('data-oid')===oid);}}",
  "var local=readLocal();var pend=Object.keys(local).filter(function(k){return local[k]&&!local[k].saved;});if(pend.length>0){pend.forEach(function(qid){var e=local[qid];if(e&&e.selectedOptionId){var a=answers[qid]||{selectedOptionId:null,isDoubtful:false,audioPlayCount:0};a.selectedOptionId=e.selectedOptionId;a.isDoubtful=e.isDoubtful;answers[qid]=a;markSelected(qid,e.selectedOptionId);}});updateTop();updateGrid();flushPending();}",
  "showQuestion(0);updateTop();",
  "}",
  "init();",
  "})();",
].join("\n");

function shell(title: string, body: string, json: string): string {
  return (
    "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n<meta charset=\"utf-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n" +
    "<title>" + esc(title) + "</title>\n<style>\n" + CSS + "\n</style>\n</head>\n" +
    "<body data-font=\"normal\">\n" + body +
    "\n<script type=\"application/json\" id=\"exam-json\">" + json + "</script>\n" +
    "<script>\n" + SCRIPT + "\n</script>\n</body>\n</html>"
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
        "<div class=\"app\"><div style=\"max-width:720px;margin:40px auto;padding:0 16px\"><div class=\"center-card\"><h1>Ujian tidak ditemukan</h1>" +
          "<p>Attempt ini bukan milik akun yang sedang login.</p>" +
          "<p><a class=\"link\" href=\"/exam\">Kembali ke Portal Ujian</a></p></div></div></div>",
        "{}"
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
        "<div class=\"app\"><div style=\"max-width:720px;margin:40px auto;padding:0 16px\"><div class=\"center-card\"><h1>Attempt tidak ditemukan</h1>" +
          "<p><a class=\"link\" href=\"/exam\">Kembali ke Portal Ujian</a></p></div></div></div>",
        "{}"
      ),
      404
    );
  }

  // Attempt sudah selesai → halaman selesai + tautan hasil.
  if (state.attempt.status !== "IN_PROGRESS") {
    return htmlResponse(
      shell(
        "Ujian Selesai",
        "<div class=\"app\"><div style=\"max-width:720px;margin:40px auto;padding:0 16px\"><div class=\"center-card\"><h1>Ujian ini sudah selesai</h1>" +
          "<p>Status: " + esc(state.attempt.status) + "</p>" +
          "<p><a class=\"link\" href=\"/hasil/" + esc(attemptId) + "\">Lihat Hasil</a> &nbsp;·&nbsp; " +
          "<a class=\"link\" href=\"/exam\">Kembali ke Portal Ujian</a></p></div></div></div>",
        "{}"
      )
    );
  }

  const current = state.currentSection;
  if (!current) {
    return htmlResponse(
      shell(
        "Ujian",
        "<div class=\"app\"><div style=\"max-width:720px;margin:40px auto;padding:0 16px\"><div class=\"center-card\"><h1>Tidak ada maharoh yang sedang berjalan</h1>" +
          "<p>Coba muat ulang halaman ini.</p>" +
          "<p><a class=\"link\" href=\"/ujian-ringan/" + esc(attemptId) + "\">Muat ulang</a> &nbsp;·&nbsp; " +
          "<a class=\"link\" href=\"/exam\">Kembali ke Portal Ujian</a></p></div></div></div>",
        "{}"
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
  const answeredCount = current.questions.filter(
    (q) => answers.get(q.id)?.selectedOptionId
  ).length;
  const doubtfulCount = current.questions.filter(
    (q) => answers.get(q.id)?.isDoubtful
  ).length;

  // Data untuk kontroler JS.
  const clientData = {
    attemptId,
    sectionId: current.id,
    mode: state.exam.mode,
    audioLimit: limit,
    total: current.questions.length,
    remaining: remainingSeconds,
    questions: current.questions.map((q) => ({ id: q.id })),
    answers: Object.fromEntries(
      current.questions.map((q) => {
        const a = answers.get(q.id);
        return [
          q.id,
          {
            selectedOptionId: a?.selectedOptionId ?? null,
            isDoubtful: a?.isDoubtful ?? false,
            audioPlayCount: a?.audioPlayCount ?? 0,
          },
        ];
      })
    ),
  };
  const json = JSON.stringify(clientData).replace(/</g, "\\u003c");

  // Kartu soal (satu per soal; hanya yang pertama tampil).
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
          "<div class=\"meta\"><b>Audio " + (group?.index ?? num) + "</b>" +
          (shared
            ? "<span class=\"pill\">Audio bersama</span><span>untuk Soal " + group.from + "-" + group.to + "</span>"
            : "<span>untuk Soal " + (group?.from ?? num) + "</span>") +
          "<span id=\"dur-" + esc(q.id) + "\"></span></div>" +
          "<div class=\"row\">" +
          "<button type=\"button\" class=\"abtn play-audio\" data-qid=\"" + esc(q.id) + "\" " +
          "data-url=\"" + esc(q.audioUrl) + "\" data-audio-id=\"au-" + esc(q.id) + "\" " +
          "data-count-id=\"cnt-" + esc(q.id) + "\"" +
          (played >= limit ? " disabled" : "") + ">▶ Putar Audio Soal</button>" +
          "<span id=\"cnt-" + esc(q.id) + "\">Diputar " + played + "/" + limit + "x (dari awal, tanpa seek)</span></div>" +
          "<audio class=\"au au-q\" id=\"au-" + esc(q.id) + "\" data-qid=\"" + esc(q.id) + "\" src=\"" + esc(q.audioUrl) + "\" preload=\"metadata\"></audio>" +
          "</div>"
        : "";

      const optionsHtml = q.options
        .map((o) => {
          const isSel = selected === o.id;
          const optAudio =
            o.contentType === "AUDIO" && o.audioUrl
              ? "<button type=\"button\" class=\"abtn sm play-audio\" data-qid=\"" + esc(q.id) + "\" " +
                "data-url=\"" + esc(o.audioUrl) + "\" data-audio-id=\"au-opt-" + esc(o.id) + "\" " +
                "data-count-id=\"\">▶ Putar</button>" +
                "<audio class=\"au au-o\" id=\"au-opt-" + esc(o.id) + "\" data-qid=\"" + esc(q.id) + "\" src=\"" + esc(o.audioUrl) + "\" preload=\"metadata\"></audio>"
              : "";
          return (
            "<div class=\"opt" + (isSel ? " sel" : "") + "\">" +
            "<button type=\"button\" class=\"opt-main\" data-qid=\"" + esc(q.id) + "\" data-oid=\"" + esc(o.id) + "\">" +
            "<span class=\"lbl\">" + esc(o.label) + "</span>" +
            "<span class=\"txt\" dir=\"" + (o.direction === "RTL" ? "rtl" : "ltr") + "\">" +
            (o.contentType === "AUDIO"
              ? "Jawaban audio — dengarkan di samping"
              : esc(o.content)) +
            "</span></button>" +
            optAudio +
            "</div>"
          );
        })
        .join("\n");

      return (
        "<div class=\"qcard" + (qi === 0 ? "" : " hidden") + "\" data-idx=\"" + qi + "\">" +
        "<div class=\"qscroll\">" +
        "<div class=\"qhead\">" +
        "<div style=\"display:flex;align-items:center;gap:10px;flex-wrap:wrap\">" +
        "<span class=\"badge-no\">SOAL NO. " + num + "</span>" +
        "<span class=\"badge-m\">Maharoh " + esc(current.maharohName) + "</span>" +
        "<span class=\"badge-m\">Bobot: " + q.weight + " Poin</span>" +
        "</div>" +
        "<div class=\"fontadj\"><span style=\"font-size:12px;color:#a1a1aa\">A</span>" +
        "<button type=\"button\" data-scale=\"normal\" class=\"on\">A-</button>" +
        "<button type=\"button\" data-scale=\"large\">A</button>" +
        "<button type=\"button\" data-scale=\"xlarge\">A+</button></div>" +
        "</div>" +
        "<div class=\"qbody\">" +
        "<div class=\"qcontent\" dir=\"" + (q.direction === "RTL" ? "rtl" : "ltr") + "\">" +
        esc(q.content) +
        "</div>" +
        audioBlock +
        "<div class=\"opts\">" + optionsHtml + "</div>" +
        "</div></div>" +
        "</div>"
      );
    })
    .join("\n");

  // Grid nomor soal (dipakai sidebar desktop + lembar bawah HP).
  const gridButtons = current.questions
    .map((q, idx) => {
      const a = answers.get(q.id);
      const cls =
        "nbtn" +
        (a?.isDoubtful ? " doubt" : a?.selectedOptionId ? " answered" : "");
      return (
        "<button type=\"button\" class=\"" + cls + "\" data-idx=\"" + idx + "\" data-qid=\"" + esc(q.id) + "\">" +
        (idx + 1) +
        "</button>"
      );
    })
    .join("\n");
  const legend =
    "<div class=\"legend\">" +
    "<div><span class=\"sw\" style=\"background:#18181b\"></span>Terjawab (" + answeredCount + ")</div>" +
    "<div><span class=\"sw\" style=\"background:#fbbf24\"></span>Ragu (" + doubtfulCount + ")</div>" +
    "<div><span class=\"sw\" style=\"background:#e4e4e7\"></span>Kosong (" + (current.questions.length - answeredCount) + ")</div>" +
    "</div>";

  // Daftar maharoh (sidebar).
  const maharohList = state.exam.maharohs
    .map((m) => {
      const sec = state.sections.find((s) => s.maharohId === m.id);
      const isCurrent =
        m.id === state.attempt.currentMaharohId &&
        state.attempt.status === "IN_PROGRESS";
      const done = sec && sec.status !== "IN_PROGRESS";
      return (
        "<div class=\"mrow" + (isCurrent ? " cur" : "") + "\">" +
        "<span class=\"nm\"><span class=\"dot " + (done ? "g" : isCurrent ? "a" : "z") + "\"></span>" + esc(m.name) + "</span>" +
        "<span class=\"st\">" + (done ? "Skor " + sec.score : isCurrent ? "Berjalan" : "Terkunci") + "</span>" +
        "</div>"
      );
    })
    .join("\n");

  // Teks bacaan Qira'ah — satu salinan di atas kartu soal (bukan per soal),
  // tampil di semua soal maharoh Qira'ah; bisa dilipat lewat <details>.
  const passageHtml = current.passage
    ? "<details class=\"passage\" open>" +
      "<summary><span style=\"display:flex;align-items:center;gap:8px\">Teks Bacaan <span class=\"tag\">Qira'ah</span></span><span class=\"chev\">▾</span></summary>" +
      "<div class=\"pbody\"><div class=\"ptext\">" + esc(current.passage) + "</div></div>" +
      "</details>"
    : "";

  const body =
    "<div class=\"app\">" +
    // Top bar
    "<header class=\"topbar\"><div class=\"topbar-in\">" +
    "<div style=\"min-width:0\"><h1>" + esc(state.exam.title) + "</h1>" +
    "<div class=\"sub\"><span id=\"top-soal\">Soal 1/" + current.questions.length + "</span><span>•</span>" +
    "<span>Maharoh " + esc(current.maharohName) + "</span><span>•</span>" +
    "<span id=\"top-answered\">Terjawab: " + answeredCount + "/" + current.questions.length + "</span><span>•</span>" +
    "<span id=\"top-saving\">Tersimpan otomatis</span></div></div>" +
    "<div class=\"right\"><div class=\"timer\" id=\"timer\">--:--</div>" +
    "<button type=\"button\" class=\"kumpul\" id=\"kumpul-top\">⬆ Kumpulkan Maharoh</button></div>" +
    "</div></header>" +
    "<main>" +
    "<div class=\"qcol\">" +
    // Notifikasi
    "<div class=\"notice notice-red hidden\" id=\"timeup-notice\"><b>Waktu maharoh ini habis. Jawaban Anda sudah tersimpan.</b><br>Maharoh sedang ditutup otomatis. Bila halaman ini tidak berubah, klik tombol Kumpulkan Maharoh di atas.</div>" +
    "<div class=\"notice notice-amber hidden\" id=\"warn-notice\"><button type=\"button\" class=\"x\" id=\"warn-close\">Lanjutkan</button><span id=\"warn-text\"></span></div>" +
    "<div class=\"notice notice-red hidden\" id=\"violation-notice\"><button type=\"button\" class=\"x\" id=\"violation-close\">Tutup</button><span id=\"violation-text\"></span></div>" +
    "<div class=\"notice notice-amber hidden\" id=\"audio-error\"></div>" +
    "<div class=\"notice notice-amber hidden\" id=\"fs-banner\"><span>Mode layar penuh belum aktif — ujian lebih nyaman dalam layar penuh.</span> <button type=\"button\" class=\"abtn sm\" id=\"fs-btn\" style=\"margin-left:8px\">⛶ Masuk Fullscreen</button></div>" +
    passageHtml +
    questionsHtml +
    // Bottom nav
    "<div class=\"bottomnav\">" +
    "<button type=\"button\" class=\"btn btn-prev\" id=\"prev-btn\">‹ Soal Sebelumnya</button>" +
    "<button type=\"button\" class=\"btn btn-doubt\" id=\"doubt-btn\">⚑ <span>Ragu-ragu</span></button>" +
    "<button type=\"button\" class=\"btn btn-num\" id=\"num-btn\">▦ Nomor</button>" +
    "<button type=\"button\" class=\"btn btn-next\" id=\"next-btn\">Soal Selanjutnya ›</button>" +
    "<button type=\"button\" class=\"btn btn-submit hidden\" id=\"submit-btn-bottom\">⬆ Kumpulkan Maharoh</button>" +
    "</div>" +
    "</div>" +
    // Sidebar
    "<aside class=\"side\">" +
    "<div class=\"card\"><h2>Maharoh Ujian</h2>" + maharohList + "</div>" +
    "<div class=\"card\"><h2>Navigasi Nomor Soal — " + esc(current.maharohName) + "</h2>" +
    "<div class=\"grid5\">" + gridButtons + "</div>" + legend + "</div>" +
    "</aside>" +
    "</main>" +
    // Lembar nomor soal (HP)
    "<div class=\"sheet\" id=\"number-sheet\"><div class=\"sheet-bg\" id=\"sheet-bg\"></div>" +
    "<div class=\"sheet-box\"><div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:12px\">" +
    "<h2>Navigasi Nomor Soal — " + esc(current.maharohName) + "</h2>" +
    "<button type=\"button\" id=\"sheet-close\" style=\"padding:8px;border-radius:8px;border:none;background:#f4f4f5;cursor:pointer;font-size:18px\">✕</button></div>" +
    "<div class=\"grid5\">" + gridButtons + "</div>" + legend + "</div></div>" +
    // Modal konfirmasi
    "<div class=\"modal\" id=\"confirm-modal\"><div class=\"modal-box\">" +
    "<div style=\"display:flex;align-items:center;gap:12px;color:#d97706\"><span style=\"font-size:28px\">⚠</span>" +
    "<h3>Kumpulkan Maharoh " + esc(current.maharohName) + "?</h3></div>" +
    "<p>Anda telah menjawab <strong id=\"m-answered\">" + answeredCount + " dari " + current.questions.length + " soal</strong> di maharoh ini.</p>" +
    "<p class=\"red hidden\" id=\"m-unanswered\"></p>" +
    "<p class=\"amber hidden\" id=\"m-doubtful\"></p>" +
    "<p style=\"font-size:12px;color:#a1a1aa\">Setelah dikumpulkan, maharoh ini TERKUNCI dan Anda lanjut ke maharoh berikutnya. Jawaban tidak bisa diubah lagi.</p>" +
    "<div class=\"row\"><button type=\"button\" class=\"mbtn ghost\" id=\"confirm-cancel\">Periksa Kembali</button>" +
    "<button type=\"button\" class=\"mbtn dark\" id=\"confirm-yes\">Ya, Kumpulkan Maharoh</button></div>" +
    "</div></div>" +
    "</div>";

  return htmlResponse(shell(state.exam.title + " — " + current.maharohName, body, json));
}
