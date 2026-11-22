import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  autoExpireCurrentSection,
  type SectionSnapshot,
} from "@/lib/toafl-exam";

// TOAFL Fase 4 — simpan jawaban satu soal. Hanya maharoh yang sedang
// berjalan yang bisa dijawab; soal harus ada di snapshot section itu;
// maharoh yang sudah selesai terkunci (tidak bisa kembali).
export async function POST(req: Request) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { attemptId, questionId, selectedOptionId, isDoubtful } = body;

    let attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { sections: true },
    });

    if (!attempt || attempt.userId !== userSession.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (attempt.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Waktu ujian telah selesai atau jawaban sudah dikumpulkan" },
        { status: 400 }
      );
    }

    // Penegakan timer dari server: bila maharoh sudah habis, tutup dulu.
    await autoExpireCurrentSection(attempt.id);
    attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { sections: true },
    });
    if (!attempt || attempt.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Waktu pengerjaan maharoh ini telah habis", timeUp: true },
        { status: 400 }
      );
    }

    const currentSection = attempt.sections.find(
      (s) =>
        s.maharohId === attempt.currentMaharohId && s.status === "IN_PROGRESS"
    );
    if (!currentSection) {
      return NextResponse.json(
        { error: "Tidak ada maharoh yang sedang berjalan" },
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

    if (
      selectedOptionId !== undefined &&
      selectedOptionId !== null &&
      !snapQuestion.options.some((o) => o.id === selectedOptionId)
    ) {
      return NextResponse.json(
        { error: "Opsi jawaban tidak valid untuk soal ini" },
        { status: 400 }
      );
    }

    const now = new Date();
    const answer = await prisma.attemptAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId,
        },
      },
      update: {
        ...(selectedOptionId !== undefined
          ? { selectedOptionId: selectedOptionId || null }
          : {}),
        ...(isDoubtful !== undefined
          ? { isDoubtful: Boolean(isDoubtful) }
          : {}),
        answeredAt: now,
      },
      create: {
        attemptId,
        questionId,
        maharohId: currentSection.maharohId,
        selectedOptionId: selectedOptionId || null,
        isDoubtful: Boolean(isDoubtful),
        answeredAt: now,
      },
    });

    return NextResponse.json({ answer, serverTime: now.toISOString() });
  } catch (error) {
    console.error("Save TOAFL answer error:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan jawaban" },
      { status: 500 }
    );
  }
}
