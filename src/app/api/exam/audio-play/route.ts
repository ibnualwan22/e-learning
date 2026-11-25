import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  autoExpireCurrentSection,
  type SectionSnapshot,
} from "@/lib/toafl-exam";

// TOAFL Fase 4 + audio bersama — hitung putaran audio di server (§8 plan):
// klien hanya meminta izin putar; server yang menghitung dan menegakkan
// batas audioRepeats per maharoh.
// - Audio SOAL yang URL-nya dipakai beberapa soal sekaligus (audio cerita
//   Istima'): SATU counter bersama per URL — jumlah putaran di semua soal
//   kelompok itu. Batas 2x berlaku untuk audionya, bukan per soal.
// - Audio OPSI: counter tetap per soal (satu baris counter per soal).
//   Catatan: satu soal tidak pernah punya audio soal bersama + audio opsi
//   sekaligus di bank saat ini, jadi putaran opsi tidak pernah menggerus
//   jatah audio bersama.
// Melewati batas -> tombol nonaktif.
export async function POST(req: Request) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { attemptId, questionId, url } = await req.json();

    let attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            maharohs: true,
          },
        },
        sections: true,
      },
    });

    if (!attempt || attempt.userId !== userSession.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (attempt.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Ujian sudah selesai", allowed: false },
        { status: 400 }
      );
    }

    await autoExpireCurrentSection(attempt.id);
    attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { include: { maharohs: true } },
        sections: true,
      },
    });
    if (!attempt || attempt.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Waktu pengerjaan maharoh ini telah habis", allowed: false },
        { status: 400 }
      );
    }

    const currentSection = attempt.sections.find(
      (s) =>
        s.maharohId === attempt.currentMaharohId && s.status === "IN_PROGRESS"
    );
    if (!currentSection) {
      return NextResponse.json(
        { error: "Tidak ada maharoh yang sedang berjalan", allowed: false },
        { status: 400 }
      );
    }

    const snapshot = currentSection.snapshot as unknown as SectionSnapshot;
    const snapQuestion = snapshot.questions.find((q) => q.id === questionId);
    if (!snapQuestion) {
      return NextResponse.json(
        { error: "Soal tidak ada di maharoh yang sedang berjalan" },
        { status: 400 }
      );
    }

    const hasAudio =
      Boolean(snapQuestion.audioUrl) ||
      snapQuestion.options.some((o) => o.audioUrl);
    if (!hasAudio) {
      return NextResponse.json(
        { error: "Soal ini tidak punya audio" },
        { status: 400 }
      );
    }

    const examMaharoh = attempt.exam.maharohs.find(
      (m) => m.maharohId === currentSection.maharohId
    );
    const limit = examMaharoh?.audioRepeats ?? 2;

    // URL yang diputar harus milik soal ini (audio soal atau salah satu opsi).
    const playedUrl =
      typeof url === "string" && url ? url : snapQuestion.audioUrl;
    const isQuestionAudio =
      Boolean(snapQuestion.audioUrl) && playedUrl === snapQuestion.audioUrl;
    const isOptionAudio = snapQuestion.options.some(
      (o) => o.audioUrl === playedUrl
    );
    if (!isQuestionAudio && !isOptionAudio) {
      return NextResponse.json(
        { error: "Audio tidak ada di soal ini" },
        { status: 400 }
      );
    }

    // Kelompok soal yang berbagi URL audio soal yang sama (di maharoh
    // berjalan). Audio opsi tidak dibagi: kelompoknya hanya soal ini.
    const groupIds = isQuestionAudio
      ? snapshot.questions
          .filter((q) => q.audioUrl === playedUrl)
          .map((q) => q.id)
      : [questionId];
    const shared = groupIds.length > 1;

    // Jumlah putaran = jumlah seluruh baris kelompok itu (satu baris per
    // soal; putaran dari soal mana pun menambah total kelompok).
    const agg = await prisma.attemptAnswer.aggregate({
      where: { attemptId, questionId: { in: groupIds } },
      _sum: { audioPlayCount: true },
    });
    const count = agg._sum.audioPlayCount ?? 0;
    if (count >= limit) {
      return NextResponse.json(
        {
          error: "Batas pengulangan audio sudah habis",
          allowed: false,
          count,
          remaining: 0,
          limit,
          shared,
        },
        { status: 403 }
      );
    }

    // Putaran dicatat di baris soal yang memutar — jumlah kelompok naik 1.
    await prisma.attemptAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId },
      },
      update: { audioPlayCount: { increment: 1 } },
      create: {
        attemptId,
        questionId,
        maharohId: currentSection.maharohId,
        audioPlayCount: 1,
      },
    });

    return NextResponse.json({
      allowed: true,
      count: count + 1,
      remaining: Math.max(0, limit - (count + 1)),
      limit,
      shared,
    });
  } catch (error) {
    console.error("TOAFL audio-play error:", error);
    return NextResponse.json(
      { error: "Gagal mencatat putaran audio" },
      { status: 500 }
    );
  }
}
