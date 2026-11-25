import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  advanceAfterSection,
  buildAttemptState,
  finalizeSection,
} from "@/lib/toafl-exam";

// TOAFL Fase 5 — endpoint laporan pelanggaran dari detektor klien.
// POST { attemptId, type: TAB_CLOSE | FLOATING_APP | BLUR, detail? }.
// Body dibaca sebagai teks lalu JSON.parse supaya pengiriman
// navigator.sendBeacon (pagehide/tab ditutup) tetap terbaca.
//
// Perilaku SIMULASI (autoSubmitOnViolation): pelanggaran PERTAMA di satu
// maharoh hanya PERINGATAN — maharoh tetap berjalan, waktu tetap jalan,
// peserta menekan "Lanjutkan Mengerjakan" untuk kembali. Pelanggaran
// KEDUA di maharoh yang sama (di luar jendela gema) menutup maharoh itu
// otomatis (finalizeSection SUBMITTED + advanceAfterSection). CHAMPION
// (autoSubmitOnViolation false) tetap hanya dicatat, tanpa peringatan
// maupun auto-submit.
//
// Idempotensi PER MAHAROH (perbaikan bug 24 Nov 2026): satu pindah tab
// memicu beberapa event browser (blur + visibilitychange + pagehide)
// hampir bersamaan — laporan yang tiba <10 detik sesudah pelanggaran
// terakhir di maharoh yang sama adalah gema kejadian itu, diabaikan
// supaya satu pindah tab tidak dihitung dua kali (peringatan + tutup).
// Laporan sesudah jendela itu adalah kejadian baru.
// finalizeSection sendiri juga idempotent (section yang sudah bukan
// IN_PROGRESS tidak disentuh lagi).
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

    // Hitung kejadian di maharoh ini (di luar jendela gema).
    const countForSection = target
      ? await prisma.violationEvent.count({
          where: { attemptId, sectionId: target.id },
        })
      : 0;

    let warn = false;
    let autoSubmitted = false;
    if (attempt.exam.autoSubmitOnViolation && target) {
      if (countForSection <= 1) {
        // Pelanggaran pertama di maharoh ini: peringatan saja. Maharoh
        // tetap berjalan dan waktu tetap jalan (tidak ada perpanjangan).
        warn = true;
      } else {
        await finalizeSection(target.id, "SUBMITTED");
        await advanceAfterSection(attempt.id);
        autoSubmitted = true;
      }
    }

    const state = await buildAttemptState(attempt.id);
    return NextResponse.json({ ok: true, warn, autoSubmitted, state });
  } catch (error) {
    console.error("Report TOAFL violation error:", error);
    return NextResponse.json(
      { error: "Gagal mencatat pelanggaran" },
      { status: 500 }
    );
  }
}
