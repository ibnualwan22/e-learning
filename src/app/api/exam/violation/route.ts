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
// Perilaku: pelanggaran SELALU dicatat di ViolationEvent. Bila exam
// autoSubmitOnViolation (SIMULASI) → maharoh yang sedang berjalan
// di-submit otomatis dan peserta lanjut ke maharoh berikut. Bila false
// (CHAMPION) → hanya dicatat, section tetap berjalan.
//
// Idempotensi: laporan jenis yang sama untuk attempt yang sama dalam
// 10 detik terakhir diabaikan (beberapa event browser — visibilitychange
// + blur + pagehide — sering menyala bersamaan untuk satu kejadian).
// finalizeSection sendiri juga idempotent (section yang sudah bukan
// IN_PROGRESS tidak disentuh lagi).
const VALID_TYPES = ["TAB_CLOSE", "FLOATING_APP", "BLUR"] as const;
type ViolationType = (typeof VALID_TYPES)[number];

const DEDUP_WINDOW_MS = 10_000;

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

    // Laporan ganda dalam jendela singkat = satu kejadian yang sama.
    const recent = await prisma.violationEvent.findFirst({
      where: {
        attemptId,
        type: type as ViolationType,
        at: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
      orderBy: { at: "desc" },
    });
    if (recent) {
      const state = await buildAttemptState(attempt.id);
      return NextResponse.json({ ok: true, duplicate: true, state });
    }

    await prisma.violationEvent.create({
      data: {
        attemptId,
        type: type as ViolationType,
        detail,
      },
    });

    let autoSubmitted = false;
    if (attempt.exam.autoSubmitOnViolation) {
      // Section yang jadi sasaran adalah yang sedang berjalan SAAT
      // laporan masuk — bukan section sesudah auto-expire memajukan
      // attempt (agar pelanggaran di ujung waktu tidak menutup
      // maharoh baru yang baru saja dimulai).
      const target = attempt.sections.find(
        (s) =>
          s.maharohId === attempt.currentMaharohId &&
          s.status === "IN_PROGRESS"
      );
      if (target) {
        await finalizeSection(target.id, "SUBMITTED");
        await advanceAfterSection(attempt.id);
        autoSubmitted = true;
      }
    }

    const state = await buildAttemptState(attempt.id);
    return NextResponse.json({ ok: true, autoSubmitted, state });
  } catch (error) {
    console.error("Report TOAFL violation error:", error);
    return NextResponse.json(
      { error: "Gagal mencatat pelanggaran" },
      { status: 500 }
    );
  }
}
