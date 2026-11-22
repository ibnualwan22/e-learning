import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { autoExpireCurrentSection, buildAttemptState } from "@/lib/toafl-exam";

// TOAFL Fase 4 — state ujian.
// - tanpa param: daftar exam yang bisa diikuti peserta + riwayat attempt.
// - ?examId=: info exam untuk halaman Tata Tertib ( + status registrasi
//   dan attempt terakhir peserta).
// - ?attemptId=: state penuh halaman play (section berjalan + snapshot
//   soal TANPA kunci + jawaban + sisa waktu server).
export async function GET(req: Request) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const attemptId = searchParams.get("attemptId");
  const examId = searchParams.get("examId");

  try {
    if (attemptId) {
      const owned = await prisma.attempt.findUnique({
        where: { id: attemptId },
        select: { userId: true, status: true },
      });

      if (!owned || owned.userId !== userSession.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Penegakan timer dari server: maharoh yang sudah habis ditutup
      // otomatis sebelum state dikirim.
      if (owned.status === "IN_PROGRESS") {
        await autoExpireCurrentSection(attemptId);
      }

      const state = await buildAttemptState(attemptId);
      if (!state) {
        return NextResponse.json(
          { error: "Attempt tidak ditemukan" },
          { status: 404 }
        );
      }
      return NextResponse.json(state);
    }

    if (examId) {
      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: {
          level: { select: { id: true, name: true } },
          maharohs: {
            include: { maharoh: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      });
      if (!exam) {
        return NextResponse.json(
          { error: "Ujian tidak ditemukan" },
          { status: 404 }
        );
      }

      const registration = await prisma.registration.findFirst({
        where: {
          userId: userSession.userId,
          mode: exam.mode,
          levelId: exam.levelId,
        },
        select: { status: true },
      });

      const attempt = await prisma.attempt.findFirst({
        where: { userId: userSession.userId, examId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });

      return NextResponse.json({
        serverTime: new Date().toISOString(),
        exam: {
          id: exam.id,
          title: exam.title,
          description: exam.description,
          mode: exam.mode,
          isActive: exam.isActive,
          startTime: exam.startTime,
          endTime: exam.endTime,
          autoSubmitOnViolation: exam.autoSubmitOnViolation,
          level: exam.level,
          maharohs: exam.maharohs.map((m) => ({
            id: m.maharoh.id,
            name: m.maharoh.name,
            orderIndex: m.orderIndex,
            minutes: m.minutes,
            questionCount: m.questionCount,
            audioRepeats: m.audioRepeats,
          })),
        },
        registration,
        attempt,
      });
    }

    // Mode daftar: exam yang bisa diikuti + riwayat attempt peserta.
    const dbUser = await prisma.user.findUnique({
      where: { id: userSession.userId },
      select: { email: true },
    });

    const verifiedRegs = await prisma.registration.findMany({
      where: { userId: userSession.userId, status: "VERIFIED" },
      select: { mode: true, levelId: true },
    });

    const exams =
      verifiedRegs.length > 0
        ? await prisma.exam.findMany({
            where: {
              isActive: true,
              OR: verifiedRegs.map((r) => ({
                mode: r.mode,
                levelId: r.levelId,
              })),
            },
            include: {
              level: { select: { id: true, name: true } },
              maharohs: {
                include: { maharoh: true },
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { createdAt: "desc" },
          })
        : [];

    const attempts = await prisma.attempt.findMany({
      where: { userId: userSession.userId },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            mode: true,
            level: { select: { name: true } },
          },
        },
        sections: {
          select: { maharohId: true, status: true, score: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const examsWithAttempt = exams.map((e) => {
      const att = attempts.find((a) => a.examId === e.id) ?? null;
      return {
        id: e.id,
        title: e.title,
        description: e.description,
        mode: e.mode,
        isActive: e.isActive,
        startTime: e.startTime,
        endTime: e.endTime,
        autoSubmitOnViolation: e.autoSubmitOnViolation,
        level: e.level,
        maharohs: e.maharohs.map((m) => ({
          id: m.maharoh.id,
          name: m.maharoh.name,
          orderIndex: m.orderIndex,
          minutes: m.minutes,
          questionCount: m.questionCount,
          audioRepeats: m.audioRepeats,
        })),
        attempt: att
          ? { id: att.id, status: att.status, finalScore: att.finalScore }
          : null,
      };
    });

    return NextResponse.json({
      user: { ...userSession, email: dbUser?.email ?? null },
      attempts: attempts.map((a) => ({
        id: a.id,
        examId: a.examId,
        status: a.status,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        timeSpentSeconds: a.timeSpentSeconds,
        rawScore: a.rawScore,
        finalScore: a.finalScore,
        exam: a.exam,
        sections: a.sections,
      })),
      exams: examsWithAttempt,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("TOAFL exam state error:", error);
    return NextResponse.json(
      { error: "Gagal memuat state ujian" },
      { status: 500 }
    );
  }
}
