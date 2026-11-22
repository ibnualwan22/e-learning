import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  autoExpireCurrentSection,
  type SectionSnapshot,
} from "@/lib/toafl-exam";

// TOAFL Fase 4 — hitung putaran audio di server (§8 plan): klien hanya
// meminta izin putar; server yang menghitung dan menegakkan batas
// audioRepeats per maharoh. Satu counter per soal (audio soal + audio
// opsi soal itu berbagi batas). Melewati batas -> tombol nonaktif.
export async function POST(req: Request) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { attemptId, questionId } = await req.json();

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

    const existing = await prisma.attemptAnswer.findUnique({
      where: {
        attemptId_questionId: { attemptId, questionId },
      },
      select: { audioPlayCount: true },
    });
    const count = existing?.audioPlayCount ?? 0;
    if (count >= limit) {
      return NextResponse.json(
        {
          error: "Batas pengulangan audio sudah habis",
          allowed: false,
          count,
          remaining: 0,
          limit,
        },
        { status: 403 }
      );
    }

    const row = await prisma.attemptAnswer.upsert({
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
      count: row.audioPlayCount,
      remaining: Math.max(0, limit - row.audioPlayCount),
      limit,
    });
  } catch (error) {
    console.error("TOAFL audio-play error:", error);
    return NextResponse.json(
      { error: "Gagal mencatat putaran audio" },
      { status: 500 }
    );
  }
}
