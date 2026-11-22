import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [
    totalQuestions,
    totalCategories,
    totalSessions,
    activeSessions,
    totalParticipants,
    totalAdmins,
    totalAttempts,
    inProgressAttempts,
    finishedAttempts,
    totalToaflQuestions,
    totalLevels,
    totalMaharohs,
    totalExams,
    activeExams,
  ] = await Promise.all([
    prisma.question.count(),
    prisma.questionCategory.count(),
    prisma.examSession.count(),
    prisma.examSession.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: "PARTICIPANT" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.examAttempt.count(),
    prisma.examAttempt.count({ where: { status: "IN_PROGRESS" } }),
    prisma.examAttempt.count({
      where: { status: { in: ["SUBMITTED", "TIME_UP"] } },
    }),
    // TOAFL Fase 2: bank soal = soal yang punya level (bukan soal
    // Olimpiade lama yang hanya punya kategori).
    prisma.question.count({ where: { levelId: { not: null } } }),
    prisma.level.count(),
    prisma.maharoh.count(),
    prisma.exam.count(),
    prisma.exam.count({ where: { isActive: true } }),
  ]);

  return NextResponse.json({
    stats: {
      totalQuestions,
      totalCategories,
      totalSessions,
      activeSessions,
      totalParticipants,
      totalAdmins,
      totalAttempts,
      inProgressAttempts,
      finishedAttempts,
      totalToaflQuestions,
      totalLevels,
      totalMaharohs,
      totalExams,
      activeExams,
    },
  });
}

