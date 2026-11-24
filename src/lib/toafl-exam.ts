import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

// TOAFL Fase 4 — mesin ujian: snapshot, acak, skor, timer per maharoh.
// Semua penegakan waktu memakai jam server (expiresAt di DB), bukan jam
// klien. Jawaban + penilaian merujuk snapshot yang dibekukan saat maharoh
// dimulai (§8 plan), bukan bank live.

export interface SnapshotOption {
  id: string;
  label: string;
  content: string;
  direction: "RTL" | "LTR";
  contentType: "TEXT" | "AUDIO";
  audioUrl: string | null;
  isCorrect: boolean;
}

export interface SnapshotQuestion {
  id: string;
  content: string;
  direction: "RTL" | "LTR";
  weight: number;
  audioUrl: string | null;
  explanation: string | null;
  options: SnapshotOption[];
}

export interface SectionSnapshot {
  maharohId: string;
  maharohName: string;
  minutes: number;
  audioRepeats: number;
  questionCount: number;
  questions: SnapshotQuestion[];
}

export type ClientSnapshotQuestion = Omit<SnapshotQuestion, "options"> & {
  options: Omit<SnapshotOption, "isCorrect">[];
};

export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// PENTING: jangan pernah kirim isCorrect ke peserta.
export function stripSnapshotForClient(
  snapshot: SectionSnapshot
): Omit<SectionSnapshot, "questions"> & {
  questions: ClientSnapshotQuestion[];
} {
  return {
    ...snapshot,
    questions: snapshot.questions.map((q) => ({
      ...q,
      // Ambil field satu per satu (tanpa isCorrect) — jangan pakai
      // destructuring rest di sini supaya tidak ada variabel tak terpakai.
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        content: o.content,
        direction: o.direction,
        contentType: o.contentType,
        audioUrl: o.audioUrl,
      })),
    })),
  };
}

export interface ExamMaharohConfig {
  maharohId: string;
  minutes: number;
  audioRepeats: number;
  questionCount: number;
  orderIndex: number;
}

// Pilih soal acak dari bank level itu sebanyak questionCount (bila bank
// berisi lebih sedikit, pakai yang ada), acak urutan opsi per soal, lalu
// bekukan menjadi snapshot. Opsi audio ikut menempel ke opsi yang benar
// karena pengacakan membawa seluruh objek opsi.
export async function buildSectionSnapshot(
  levelId: string,
  maharohName: string,
  em: ExamMaharohConfig
): Promise<SectionSnapshot> {
  const bank = await prisma.question.findMany({
    where: { levelId, maharohId: em.maharohId },
    include: { options: { orderBy: { label: "asc" } } },
  });

  const picked = shuffleArray(bank).slice(0, em.questionCount);
  const questions: SnapshotQuestion[] = picked.map((q) => ({
    id: q.id,
    content: q.content,
    direction: q.direction,
    weight: q.weight,
    audioUrl: q.audioUrl ?? null,
    explanation: q.explanation ?? null,
    options: shuffleArray(q.options).map((o, i) => ({
      id: o.id,
      // Label ulang sesuai posisi tampil (A, B, C, D berurutan). Penilaian
      // memakai ID opsi, bukan label, jadi tidak berubah.
      label: String.fromCharCode(65 + i),
      content: o.content,
      direction: o.direction,
      contentType: o.contentType,
      audioUrl: o.audioUrl ?? null,
      isCorrect: o.isCorrect,
    })),
  }));

  return {
    maharohId: em.maharohId,
    maharohName,
    minutes: em.minutes,
    audioRepeats: em.audioRepeats,
    questionCount: em.questionCount,
    questions,
  };
}

// Skor bobot murni (§7): benar = bobot soal; salah/kosong = 0. Tanpa
// penalti dan tanpa bonus kecepatan.
export function scoreSection(
  snapshot: SectionSnapshot,
  answers: { questionId: string; selectedOptionId: string | null }[]
): number {
  const ansMap = new Map(
    answers.map((a) => [a.questionId, a.selectedOptionId])
  );
  let score = 0;
  for (const q of snapshot.questions) {
    const selected = ansMap.get(q.id);
    if (!selected) continue;
    const correct = q.options.find((o) => o.isCorrect);
    if (correct && correct.id === selected) score += q.weight;
  }
  return Math.round(score * 100) / 100;
}

export async function finalizeSection(
  sectionId: string,
  statusOverride?: "SUBMITTED" | "TIME_UP"
) {
  const section = await prisma.sectionAttempt.findUnique({
    where: { id: sectionId },
  });
  if (!section || section.status !== "IN_PROGRESS") return section;

  const snapshot = section.snapshot as unknown as SectionSnapshot;
  const answers = await prisma.attemptAnswer.findMany({
    where: { attemptId: section.attemptId, maharohId: section.maharohId },
    select: { questionId: true, selectedOptionId: true },
  });
  const score = scoreSection(snapshot, answers);
  const status =
    statusOverride ??
    (new Date() > section.expiresAt ? "TIME_UP" : "SUBMITTED");

  return prisma.sectionAttempt.update({
    where: { id: sectionId },
    data: {
      status,
      score,
      finishedAt: status === "TIME_UP" ? section.expiresAt : new Date(),
    },
  });
}

// Mulai satu maharoh: bangun snapshot + buat SectionAttempt + jadikan
// maharoh berjalan di Attempt (+ catat urutan soal di questionOrder).
export async function startSection(
  attemptId: string,
  levelId: string,
  maharohName: string,
  em: ExamMaharohConfig
) {
  const snapshot = await buildSectionSnapshot(levelId, maharohName, em);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + em.minutes * 60 * 1000);

  const section = await prisma.sectionAttempt.create({
    data: {
      attemptId,
      maharohId: em.maharohId,
      status: "IN_PROGRESS",
      startedAt: now,
      expiresAt,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { questionOrder: true },
  });
  const prevOrder =
    attempt?.questionOrder &&
    typeof attempt.questionOrder === "object" &&
    !Array.isArray(attempt.questionOrder)
      ? (attempt.questionOrder as Record<string, string[]>)
      : {};
  const nextOrder: Record<string, string[]> = {
    ...prevOrder,
    [em.maharohId]: snapshot.questions.map((q) => q.id),
  };

  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      currentMaharohId: em.maharohId,
      questionOrder: nextOrder as unknown as Prisma.InputJsonValue,
    },
  });

  return section;
}

export async function finalizeAttempt(
  attemptId: string,
  statusOverride?: "SUBMITTED" | "TIME_UP"
) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { sections: true },
  });
  if (!attempt || attempt.status !== "IN_PROGRESS") return attempt;

  const total = Math.round(
    attempt.sections.reduce((sum, s) => sum + s.score, 0) * 100
  ) / 100;
  const status = statusOverride ?? "SUBMITTED";
  const finishedAt = new Date();
  const timeSpentSeconds = Math.max(
    1,
    Math.floor((finishedAt.getTime() - attempt.startedAt.getTime()) / 1000)
  );

  return prisma.attempt.update({
    where: { id: attemptId },
    data: {
      status,
      finishedAt,
      timeSpentSeconds,
      rawScore: total,
      finalScore: total,
    },
  });
}

// Sesudah sebuah section selesai: lanjut ke maharoh berikut (bila ada),
// atau finalisasi attempt bila itu maharoh terakhir.
export async function advanceAfterSection(attemptId: string) {
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
      sections: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!attempt || attempt.status !== "IN_PROGRESS") return attempt;

  const lastSection = attempt.sections[0] ?? null;
  const lastMaharohId = lastSection?.maharohId ?? attempt.currentMaharohId;
  const ordered = attempt.exam.maharohs;
  const currentIdx = ordered.findIndex((m) => m.maharohId === lastMaharohId);
  const next = ordered[currentIdx + 1];

  if (!next) {
    return finalizeAttempt(
      attemptId,
      lastSection?.status === "TIME_UP" ? "TIME_UP" : "SUBMITTED"
    );
  }

  await startSection(
    attemptId,
    attempt.exam.levelId,
    next.maharoh.name,
    next
  );
  return prisma.attempt.findUnique({ where: { id: attemptId } });
}

// Bila maharoh berjalan sudah melewati expiresAt: tutup sebagai TIME_UP
// lalu lanjut/finalisasi. Dipanggil di awal state/answer/submit-section
// supaya penegakan waktu selalu dari server, bukan dari tab peserta.
export async function autoExpireCurrentSection(attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { sections: true },
  });
  if (!attempt || attempt.status !== "IN_PROGRESS") return attempt;

  const current = attempt.sections.find(
    (s) => s.maharohId === attempt.currentMaharohId && s.status === "IN_PROGRESS"
  );
  if (!current) return attempt;
  if (new Date() <= current.expiresAt) return attempt;

  await finalizeSection(current.id, "TIME_UP");
  return advanceAfterSection(attemptId);
}

// State penuh satu attempt — bentuk kanonik yang sama dipakai route
// state (GET) dan start/submit-section (POST), supaya klien selalu
// mendapat section berjalan + skor + jawaban, baik saat mulai baru,
// resume, maupun sesudah mengumpulkan maharoh. (Ditemukan saat
// verifikasi Fase 4: start hanya mengembalikan attemptId tanpa
// currentSection, dan submit-section hanya mengembalikan attempt.)
export async function buildAttemptState(attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: {
        include: {
          level: { select: { id: true, name: true } },
          maharohs: {
            include: { maharoh: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
      sections: { orderBy: { createdAt: "asc" } },
      answers: true,
    },
  });
  if (!attempt) return null;

  const currentSection =
    attempt.status === "IN_PROGRESS"
      ? (attempt.sections.find(
          (s) =>
            s.maharohId === attempt.currentMaharohId &&
            s.status === "IN_PROGRESS"
        ) ?? null)
      : null;

  const sections = attempt.sections.map((s) => {
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
      // Total bobot maksimal maharoh ini (dari snapshot) — dasar
      // persentase untuk predikat di halaman hasil.
      maxScore: snap.questions.reduce((sum, q) => sum + q.weight, 0),
    };
  });

  return {
    serverTime: new Date().toISOString(),
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      timeSpentSeconds: attempt.timeSpentSeconds,
      rawScore: attempt.rawScore,
      finalScore: attempt.finalScore,
      currentMaharohId: attempt.currentMaharohId,
    },
    exam: {
      id: attempt.exam.id,
      title: attempt.exam.title,
      description: attempt.exam.description,
      mode: attempt.exam.mode,
      autoSubmitOnViolation: attempt.exam.autoSubmitOnViolation,
      level: attempt.exam.level,
      maharohs: attempt.exam.maharohs.map((m) => ({
        id: m.maharoh.id,
        name: m.maharoh.name,
        orderIndex: m.orderIndex,
        minutes: m.minutes,
        questionCount: m.questionCount,
        audioRepeats: m.audioRepeats,
      })),
    },
    sections,
    currentSection: currentSection
      ? {
          id: currentSection.id,
          maharohId: currentSection.maharohId,
          maharohName: (
            currentSection.snapshot as unknown as SectionSnapshot
          ).maharohName,
          status: currentSection.status,
          startedAt: currentSection.startedAt,
          expiresAt: currentSection.expiresAt,
          questions: stripSnapshotForClient(
            currentSection.snapshot as unknown as SectionSnapshot
          ).questions,
        }
      : null,
    answers: attempt.answers.map((a) => ({
      questionId: a.questionId,
      maharohId: a.maharohId,
      selectedOptionId: a.selectedOptionId,
      isDoubtful: a.isDoubtful,
      answeredAt: a.answeredAt,
      audioPlayCount: a.audioPlayCount,
    })),
  };
}
