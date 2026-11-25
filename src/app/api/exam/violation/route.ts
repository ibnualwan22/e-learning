import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildAttemptState } from "@/lib/toafl-exam";

// TOAFL Fase 5 — endpoint laporan pelanggaran dari detektor klien.
// POST { attemptId, type: TAB_CLOSE | FLOATING_APP | BLUR, detail? }.
// Body dibaca sebagai teks lalu JSON.parse supaya pengiriman
// navigator.sendBeacon (pagehide/tab ditutup) tetap terbaca.
//
// Perilaku: pelanggaran dicatat di ViolationEvent. SIMULASI
// (autoSubmitOnViolation): pelanggaran HANYA memunculkan peringatan —
// logika auto-submit DIHAPUS (keputusan user 25 Nov 2026). Maharoh tetap
// berjalan, waktu tetap jalan. CHAMPION (autoSubmitOnViolation false):
// tetap hanya dicatat, tanpa peringatan.
//
// TULISAN GERTAKAN: teks yang dilihat peserta (tata tertib + modal
// peringatan) tetap menyebut auto-submit — itu sengaja, supaya peserta
// tetap mengira maharoh akan ditutup otomatis. Jangan "memperbaiki"
// teks itu tanpa perintah user.
//
// Idempotensi PER MAHAROH (perbaikan bug 24 Nov 2026): satu pindah tab
// memicu beberapa event browser (blur + visibilitychange + pagehide)
// hampir bersamaan — laporan yang tiba <10 detik sesudah pelanggaran
// terakhir di maharoh yang sama adalah gema kejadian itu, diabaikan
// supaya satu pindah tab tidak tercatat dua kali.
const VALID_TYPES = ["TAB_CLOSE", "FLOATING_APP", "BLUR"] as const;
type ViolationType = (typeof VALID_TYPES)[number];

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await readBody(req);
    const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
    const type = typeof body.type === "string" ? body.type : "";
    const detail = typeof body.detail === "string" ? body.detail : null;

    if (!attemptId || !VALID_TYPES.includes(type as ViolationType)) {
      return NextResponse.json(
        { error: "Permintaan tidak valid" },
        { status: 400 }
      );
    }

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { select: { autoSubmitOnViolation: true } },
        sections: true,
      },
    });

    if (!attempt || attempt.userId !== userSession.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (attempt.status !== "IN_PROGRESS") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Section yang jadi sasaran adalah yang sedang berjalan SAAT
    // laporan masuk — bukan section sesudah auto-expire memajukan
    // attempt (agar pelanggaran di ujung waktu tidak menutup
    // maharoh baru yang baru saja dimulai).
    const target = attempt.sections.find(
      (s) =>
        s.maharohId === attempt.currentMaharohId &&
        s.status === "IN_PROGRESS"
    );

    // Satu kejadian fisik = satu laporan per maharoh. Laporan yang tiba
    // <10 detik sesudah pelanggaran terakhir di maharoh yang sama adalah
    // gema dari kejadian yang sama (blur + visibilitychange + pagehide) —
    // abaikan tanpa menghitungnya sebagai pelanggaran baru.
    const BURST_WINDOW_MS = 10_000;
    if (target) {
      const existing = await prisma.violationEvent.findFirst({
        where: { attemptId, sectionId: target.id },
        orderBy: { at: "desc" },
      });
      if (
        existing &&
        Date.now() - new Date(existing.at).getTime() < BURST_WINDOW_MS
      ) {
        const state = await buildAttemptState(attempt.id);
        return NextResponse.json({ ok: true, duplicate: true, state });
      }
    }

    await prisma.violationEvent.create({
      data: {
        attemptId,
        sectionId: target?.id ?? null,
        type: type as ViolationType,
        detail,
      },
    });

    // SIMULASI: pelanggaran HANYA peringatan — logika auto-submit
    // dihapus (keputusan user 25 Nov 2026). Maharoh tetap berjalan, waktu
    // tetap jalan. CHAMPION: tetap hanya dicatat, tanpa peringatan.
    // autoSubmitted: false dipertahankan di respons supaya klien lama
    // (yang sudah memuat halaman sebelum deploy) berperilaku sama.
    const warn = Boolean(attempt.exam.autoSubmitOnViolation && target);

    const state = await buildAttemptState(attempt.id);
    return NextResponse.json({ ok: true, warn, autoSubmitted: false, state });
  } catch (error) {
    console.error("Report TOAFL violation error:", error);
    return NextResponse.json(
      { error: "Gagal mencatat pelanggaran" },
      { status: 500 }
    );
  }
}
