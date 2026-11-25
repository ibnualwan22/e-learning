import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { finalizeSection, startSection } from "@/lib/toafl-exam";

// TOAFL — aksi admin di monitoring: "Lanjutkan Ujian" / pindahkan peserta
// ke sebuah maharoh yang terlewat atau terkunci. SIMULASI saja.
// POST { attemptId, maharohId? }
//
// - Tanpa maharohId: target = maharoh terakhir yang punya pelanggaran dan
//   sudah tertutup; bila tidak ada, maharoh pertama yang belum selesai.
// - Maharoh tujuan sudah punya section SUBMITTED/TIME_UP: BUKA LAGI dengan
//   baris yang sama (unik per attempt+maharoh) — status IN_PROGRESS, skor
//   dibersihkan, waktu BARU penuh dari sekarang, jawaban lama tetap
//   tersimpan (AttemptAnswer tidak dihapus).
// - Maharoh tujuan belum punya section: mulai baru (startSection).
// - Section lain yang sedang IN_PROGRESS ditutup dulu (skor apa adanya)
//   supaya selalu hanya satu maharoh berjalan.
// - Attempt yang sudah selesai dibuka lagi (IN_PROGRESS, nilai akhir
//   dibersihkan — dihitung ulang saat finalisasi berikutnya).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
    const maharohId =
      typeof body.maharohId === "string" ? body.maharohId : "";
    if (!attemptId) {
      return NextResponse.json(
        { error: "attemptId wajib diisi" },
        { status: 400 }
      );
    }

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            maharohs: {
              include: { maharoh: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        sections: true,
      },
    });
    if (!attempt) {
      return NextResponse.json(
        { error: "Attempt tidak ditemukan" },
        { status: 404 }
      );
    }
    if (attempt.exam.mode !== "SIMULASI") {
      return NextResponse.json(
        { error: "Aksi ini hanya untuk simulasi" },
        { status: 400 }
      );
    }

    const ordered = attempt.exam.maharohs;
    if (ordered.length === 0) {
      return NextResponse.json(
        { error: "Ujian ini belum punya maharoh" },
        { status: 400 }
      );
    }

    // Tentukan maharoh tujuan.
    let target = maharohId
      ? ordered.find((m) => m.maharohId === maharohId)
      : undefined;
    if (maharohId && !target) {
      return NextResponse.json(
        { error: "Maharoh tidak ditemukan di ujian ini" },
        { status: 400 }
      );
    }
    if (!target) {
      // Default: maharoh terakhir yang punya pelanggaran dan sudah
      // tertutup (kasus "Lanjutkan Ujian" sesudah auto-submit).
      const lastViolation = await prisma.violationEvent.findFirst({
        where: { attemptId },
        orderBy: { at: "desc" },
      });
      const violatedSection = lastViolation?.sectionId
        ? attempt.sections.find((s) => s.id === lastViolation.sectionId)
        : undefined;
      if (violatedSection && violatedSection.status !== "IN_PROGRESS") {
        target = ordered.find(
          (m) => m.maharohId === violatedSection.maharohId
        );
      }
      // Bila tidak ada: maharoh pertama yang belum selesai.
      if (!target) {
        const completedIds = new Set(
          attempt.sections
            .filter((s) => s.status !== "IN_PROGRESS")
            .map((s) => s.maharohId)
        );
        target = ordered.find((m) => !completedIds.has(m.maharohId));
      }
      if (!target) {
        return NextResponse.json(
          { error: "Semua maharoh sudah selesai" },
          { status: 400 }
        );
      }
    }

    const targetSection = attempt.sections.find(
      (s) => s.maharohId === target.maharohId
    );
    if (targetSection && targetSection.status === "IN_PROGRESS") {
      // Sudah di maharoh ini — pastikan attempt menunjuk ke sana.
      await prisma.attempt.update({
        where: { id: attemptId },
        data: { currentMaharohId: target.maharohId },
      });
      return NextResponse.json({
        ok: true,
        attemptId,
        maharohId: target.maharohId,
        maharohName: target.maharoh.name,
        alreadyThere: true,
      });
    }

    // Tutup maharoh lain yang sedang berjalan (skor apa adanya).
    const running = attempt.sections.find(
      (s) => s.status === "IN_PROGRESS" && s.maharohId !== target.maharohId
    );
    if (running) {
      await finalizeSection(running.id);
    }

    if (targetSection) {
      // Buka lagi: baris yang sama, waktu baru penuh, skor dibersihkan.
      const now = new Date();
      await prisma.sectionAttempt.update({
        where: { id: targetSection.id },
        data: {
          status: "IN_PROGRESS",
          score: 0,
          startedAt: now,
          expiresAt: new Date(now.getTime() + target.minutes * 60 * 1000),
          finishedAt: null,
        },
      });
    } else {
      await startSection(
        attemptId,
        attempt.exam.levelId,
        target.maharoh.name,
        target
      );
    }

    // Buka lagi attempt yang sudah selesai.
    if (attempt.status !== "IN_PROGRESS") {
      await prisma.attempt.update({
        where: { id: attemptId },
        data: {
          status: "IN_PROGRESS",
          finishedAt: null,
          timeSpentSeconds: null,
          rawScore: 0,
          finalScore: 0,
        },
      });
    }
    // startSection sudah mengatur currentMaharohId bila section baru;
    // untuk section yang dibuka lagi, atur eksplisit.
    await prisma.attempt.update({
      where: { id: attemptId },
      data: { currentMaharohId: target.maharohId },
    });

    return NextResponse.json({
      ok: true,
      attemptId,
      maharohId: target.maharohId,
      maharohName: target.maharoh.name,
    });
  } catch (error) {
    console.error("TOAFL admin move error:", error);
    return NextResponse.json(
      { error: "Gagal memindahkan peserta" },
      { status: 500 }
    );
  }
}
