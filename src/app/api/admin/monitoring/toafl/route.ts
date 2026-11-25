import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { autoExpireCurrentSection } from "@/lib/toafl-exam";
import type { SectionSnapshot } from "@/lib/toafl-exam";

// TOAFL Fase 5 — monitoring admin untuk mesin ujian TOAFL (terpisah dari
// monitoring Olimpiade lama di /api/admin/monitoring).
//
// GET ?examId= — daftar exam + attempt exam terpilih (live: maharoh
// berjalan + sisa waktu) + ringkasan + 20 pelanggaran terakhir.
// GET ?attemptId= — detail satu attempt: jawaban per soal + kolom Jeda
// + daftar pelanggaran attempt itu.
//
// Kolom Jeda (§6 plan): selisih simpanan jawaban dengan simpanan
// SEBELUMNYA SECARA KRONOLOGIS dalam satu maharoh; jawaban pertama
// sebuah maharoh dihitung dari waktu mulai maharoh itu
// (section.startedAt). answeredAt = simpan terakhir — revisi
// menggesernya. Soal belum dijawab tidak punya baris. Jeda ini SINYAL
// POLA, bukan bukti — tanpa diskualifikasi otomatis.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const attemptId = searchParams.get("attemptId");

  if (attemptId) {
    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        user: {
          select: { id: true, username: true, name: true, institution: true },
        },
        exam: {
          include: {
            level: { select: { id: true, name: true } },
            maharohs: {
              include: { maharoh: { select: { id: true, name: true } } },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        sections: { orderBy: { createdAt: "asc" } },
        answers: true,
        violations: { orderBy: { at: "desc" } },
      },
    });
    if (!attempt) {
      return NextResponse.json(
        { error: "Attempt tidak ditemukan" },
        { status: 404 }
      );
    }

    const answerRows: {
      maharohName: string;
      order: number;
      questionId: string;
      content: string;
      selectedLabel: string | null;
      selectedContent: string | null;
      isCorrect: boolean | null;
      isDoubtful: boolean;
      answeredAt: string;
      jedaMs: number | null;
    }[] = [];

    for (const section of attempt.sections) {
      const snap = section.snapshot as unknown as SectionSnapshot;
      const qMap = new Map(snap.questions.map((q, i) => [q.id, { q, i }]));
      const sectionAnswers = attempt.answers
        .filter((a) => a.maharohId === section.maharohId)
        .sort(
          (a, b) =>
            new Date(a.answeredAt).getTime() - new Date(b.answeredAt).getTime()
        );
      let prevMs = new Date(section.startedAt).getTime();
      for (const a of sectionAnswers) {
        const found = qMap.get(a.questionId);
        if (!found) continue;
        const t = new Date(a.answeredAt).getTime();
        const selected = a.selectedOptionId
          ? (found.q.options.find((o) => o.id === a.selectedOptionId) ?? null)
          : null;
        answerRows.push({
          maharohName: snap.maharohName,
          order: found.i + 1,
          questionId: a.questionId,
          content: found.q.content,
          selectedLabel: selected?.label ?? null,
          selectedContent: selected?.content ?? null,
          isCorrect: selected ? selected.isCorrect : null,
          isDoubtful: a.isDoubtful,
          answeredAt: a.answeredAt.toISOString(),
          jedaMs: t - prevMs,
        });
        prevMs = t;
      }
    }

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
        timeSpentSeconds: attempt.timeSpentSeconds,
        rawScore: attempt.rawScore,
        finalScore: attempt.finalScore,
        currentMaharohId: attempt.currentMaharohId,
        user: attempt.user,
        exam: {
          id: attempt.exam.id,
          title: attempt.exam.title,
          mode: attempt.exam.mode,
          level: attempt.exam.level,
          maharohs: attempt.exam.maharohs.map((m) => ({
            maharohId: m.maharohId,
            name: m.maharoh.name,
            orderIndex: m.orderIndex,
            minutes: m.minutes,
          })),
        },
      },
      sections: attempt.sections.map((s) => {
        const snap = s.snapshot as unknown as SectionSnapshot;
        return {
          id: s.id,
          maharohId: s.maharohId,
          maharohName: snap.maharohName,
          status: s.status,
          startedAt: s.startedAt,
          expiresAt: s.expiresAt,
          finishedAt: s.finishedAt,
          score: s.score,
          questionCount: snap.questions.length,
        };
      }),
      answers: answerRows,
      violations: attempt.violations.map((v) => ({
        id: v.id,
        type: v.type,
        at: v.at,
        detail: v.detail,
      })),
    });
  }

  const exams = await prisma.exam.findMany({
    select: {
      id: true,
      title: true,
      mode: true,
      isActive: true,
      _count: { select: { attempts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const examId = searchParams.get("examId") || exams[0]?.id;

  if (!examId) {
    return NextResponse.json({
      exams: [],
      attempts: [],
      summary: null,
      violations: [],
      serverTime: new Date().toISOString(),
    });
  }

  // Tutup section yang sudah lewat tenggat supaya daftar live akurat.
  const live = await prisma.attempt.findMany({
    where: { examId, status: "IN_PROGRESS" },
    select: { id: true },
  });
  for (const a of live) {
    await autoExpireCurrentSection(a.id);
  }

  const attempts = await prisma.attempt.findMany({
    where: { examId },
    include: {
      user: {
        select: { id: true, username: true, name: true, institution: true },
      },
      sections: { orderBy: { createdAt: "asc" } },
      _count: { select: { answers: true, violations: true } },
    },
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
  });

  const nowMs = Date.now();
  const attemptRows = attempts.map((a) => {
    const current = a.sections.find(
      (s) =>
        s.maharohId === a.currentMaharohId && s.status === "IN_PROGRESS"
    );
    const currentSnap = current
      ? (current.snapshot as unknown as SectionSnapshot)
      : null;
    const totalQuestions = a.sections.reduce((sum, s) => {
      const snap = s.snapshot as unknown as SectionSnapshot;
      return sum + snap.questions.length;
    }, 0);
    return {
      id: a.id,
      status: a.status,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      timeSpentSeconds: a.timeSpentSeconds,
      rawScore: a.rawScore,
      finalScore: a.finalScore,
      user: a.user,
      currentMaharohName: currentSnap?.maharohName ?? null,
      remainingSeconds:
        a.status === "IN_PROGRESS" && current
          ? Math.max(
              0,
              Math.floor((new Date(current.expiresAt).getTime() - nowMs) / 1000)
            )
          : null,
      answeredCount: a._count.answers,
      totalQuestions,
      violationCount: a._count.violations,
      sections: a.sections.map((s) => {
        const snap = s.snapshot as unknown as SectionSnapshot;
        return {
          maharohId: s.maharohId,
          maharohName: snap.maharohName,
          status: s.status,
          score: s.score,
        };
      }),
    };
  });

  const summary = {
    totalAttempts: attempts.length,
    working: attempts.filter((a) => a.status === "IN_PROGRESS").length,
    finished: attempts.filter((a) => a.status !== "IN_PROGRESS").length,
    totalViolations: attempts.reduce(
      (sum, a) => sum + a._count.violations,
      0
    ),
  };

  const recentViolations = await prisma.violationEvent.findMany({
    include: {
      attempt: {
        include: {
          user: { select: { username: true, name: true } },
          exam: { select: { title: true } },
        },
      },
    },
    orderBy: { at: "desc" },
    take: 20,
  });

  return NextResponse.json({
    exams,
    selectedExamId: examId,
    attempts: attemptRows,
    summary,
    violations: recentViolations.map((v) => ({
      id: v.id,
      type: v.type,
      at: v.at,
      detail: v.detail,
      attemptId: v.attemptId,
      username: v.attempt.user.username,
      name: v.attempt.user.name,
      examTitle: v.attempt.exam.title,
    })),
    serverTime: new Date().toISOString(),
  });
}
