import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// TOAFL Fase 6 — leaderboard publik TOAFL Champion.
// GET /api/leaderboard (tanpa examId) -> daftar exam Champion.
// GET /api/leaderboard?examId=... -> top 100 + peringkat diri (bila login).
// Aturan peringkat (sama dengan yang diiklankan + monitoring admin):
// nilai tertinggi, lalu paling dulu selesai, lalu durasi tercepat.
// Hanya attempt yang sudah selesai (SUBMITTED/TIME_UP). Leaderboard
// tidak digerbang pengumuman — yang digerbang hanya sertifikat.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const examId = searchParams.get("examId") || "";

  if (!examId) {
    const exams = await prisma.exam.findMany({
      where: { mode: "CHAMPION" },
      select: {
        id: true,
        title: true,
        isActive: true,
        level: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      exams: exams.map((e) => ({
        id: e.id,
        title: e.title,
        isActive: e.isActive,
        levelName: e.level.name,
      })),
    });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      title: true,
      mode: true,
      certificateReleased: true,
      level: { select: { id: true, name: true } },
    },
  });
  if (!exam || exam.mode !== "CHAMPION") {
    return NextResponse.json(
      { error: "Exam Champion tidak ditemukan" },
      { status: 404 }
    );
  }

  const attempts = await prisma.attempt.findMany({
    where: {
      examId,
      status: { in: ["SUBMITTED", "TIME_UP"] },
    },
    select: {
      id: true,
      userId: true,
      finalScore: true,
      finishedAt: true,
      timeSpentSeconds: true,
      user: { select: { name: true } },
    },
    orderBy: [
      { finalScore: "desc" },
      { finishedAt: "asc" },
      { timeSpentSeconds: "asc" },
    ],
  });

  const rows = attempts.slice(0, 100).map((a, i) => ({
    rank: i + 1,
    attemptId: a.id,
    userId: a.userId,
    userName: a.user.name,
    finalScore: a.finalScore,
    finishedAt: a.finishedAt,
    timeSpentSeconds: a.timeSpentSeconds,
  }));

  let selfRank: number | null = null;
  let selfAttemptId: string | null = null;
  const session = await getSession();
  if (session) {
    const idx = attempts.findIndex((a) => a.userId === session.userId);
    if (idx >= 0) {
      selfRank = idx + 1;
      selfAttemptId = attempts[idx].id;
    }
  }

  return NextResponse.json({
    exam: {
      id: exam.id,
      title: exam.title,
      levelName: exam.level.name,
      certificateReleased: exam.certificateReleased,
    },
    rows,
    selfRank,
    selfAttemptId,
    total: attempts.length,
  });
}
