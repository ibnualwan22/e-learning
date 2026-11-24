import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { SectionSnapshot } from "@/lib/toafl-exam";
import { cumulativeScore, normalizeSectionScore } from "@/lib/toafl-score";

// TOAFL Fase 6 — pembahasan hasil ujian.
// GET /api/exam/review?attemptId=...
// Pemilik attempt atau admin. Attempt harus sudah selesai.
// - SIMULASI: kunci + penjelasan per soal ikut dikirim (pembahasan).
// - CHAMPION: kunci + penjelasan TIDAK dikirim (tanpa pembahasan);
//   halaman hasil menampilkan leaderboard + sertifikat bila sudah
//   diumumkan. Penilaian merujuk snapshot yang dibekukan saat maharoh
//   dimulai, bukan bank live.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const attemptId = searchParams.get("attemptId") || "";
  if (!attemptId) {
    return NextResponse.json(
      { error: "attemptId wajib diisi" },
      { status: 400 }
    );
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      user: { select: { id: true, name: true } },
      exam: {
        select: {
          id: true,
          title: true,
          mode: true,
          certificateReleased: true,
          level: { select: { id: true, name: true } },
        },
      },
      sections: { orderBy: { startedAt: "asc" } },
      answers: { select: { questionId: true, selectedOptionId: true } },
    },
  });

  if (!attempt) {
    return NextResponse.json(
      { error: "Attempt tidak ditemukan" },
      { status: 404 }
    );
  }
  if (session.role !== "ADMIN" && attempt.userId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (attempt.status === "IN_PROGRESS") {
    return NextResponse.json(
      { error: "Ujian masih berjalan" },
      { status: 400 }
    );
  }

  const showReview = attempt.exam.mode === "SIMULASI";
  const ansMap = new Map(
    attempt.answers.map((a) => [a.questionId, a.selectedOptionId])
  );

  const sections = attempt.sections.map((s) => {
    const snap = s.snapshot as unknown as SectionSnapshot;
    const maxScore = snap.questions.reduce((sum, q) => sum + q.weight, 0);
    // Jumlah jawaban benar (untuk "X dari N soal benar" di halaman hasil).
    const correctCount = snap.questions.filter((q) => {
      const selected = ansMap.get(q.id);
      const correct = q.options.find((o) => o.isCorrect);
      return !!selected && !!correct && selected === correct.id;
    }).length;
    return {
      id: s.id,
      maharohId: s.maharohId,
      maharohName: snap.maharohName,
      status: s.status,
      score: s.score,
      maxScore,
      // Nilai maharoh skala 0–100 (skor mentah / bobot maksimal × 100).
      score100: normalizeSectionScore(s.score, maxScore),
      correctCount,
      questionCount: snap.questions.length,
      questions: snap.questions.map((q) => ({
        id: q.id,
        content: q.content,
        direction: q.direction,
        weight: q.weight,
        audioUrl: q.audioUrl,
        explanation: showReview ? q.explanation : null,
        selectedOptionId: ansMap.get(q.id) ?? null,
        options: q.options.map((o) => ({
          id: o.id,
          label: o.label,
          content: o.content,
          direction: o.direction,
          contentType: o.contentType,
          audioUrl: o.audioUrl,
          isCorrect: showReview ? o.isCorrect : false,
        })),
      })),
    };
  });

  const totalMax = sections.reduce((sum, s) => sum + s.maxScore, 0);
  // Nilai akumulatif = rata-rata nilai maharoh (tiap maharoh bobot sama),
  // skala 0–100. Sama dengan finalScore yang disimpan saat finalisasi.
  const cumulative = cumulativeScore(sections);

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      status: attempt.status,
      finalScore: attempt.finalScore,
      timeSpentSeconds: attempt.timeSpentSeconds,
      finishedAt: attempt.finishedAt,
      userName: attempt.user.name,
    },
    exam: {
      id: attempt.exam.id,
      title: attempt.exam.title,
      mode: attempt.exam.mode,
      levelName: attempt.exam.level.name,
      certificateReleased: attempt.exam.certificateReleased,
    },
    showReview,
    totalMax,
    cumulative,
    sections,
  });
}
