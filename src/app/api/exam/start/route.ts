import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  autoExpireCurrentSection,
  buildAttemptState,
  startSection,
} from "@/lib/toafl-exam";

// TOAFL Fase 4 — mulai ujian: buat Attempt + SectionAttempt pertama
// (snapshot maharoh pertama). Champion sekali saja; simulasi boleh
// membuat attempt baru tiap pengulangan. Attempt IN_PROGRESS yang masih
// ada dikembalikan (resume), bukan dibuat baru.
export async function POST(req: Request) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { examId } = await req.json();

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        maharohs: {
          include: { maharoh: true },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!exam || !exam.isActive) {
      return NextResponse.json(
        { error: "Ujian tidak ditemukan atau tidak aktif" },
        { status: 404 }
      );
    }

    if (exam.maharohs.length === 0) {
      return NextResponse.json(
        { error: "Ujian ini belum punya maharoh" },
        { status: 400 }
      );
    }

    // Harus terdaftar VERIFIED untuk mode + level exam ini.
    const registration = await prisma.registration.findFirst({
      where: {
        userId: userSession.userId,
        mode: exam.mode,
        levelId: exam.levelId,
        status: "VERIFIED",
      },
    });
    if (!registration) {
      return NextResponse.json(
        { error: "Anda belum terverifikasi untuk ujian ini" },
        { status: 403 }
      );
    }

    // Champion: tegakkan jadwal tetap.
    const now = new Date();
    if (exam.mode === "CHAMPION") {
      if (exam.startTime && now < exam.startTime) {
        return NextResponse.json(
          { error: "Ujian champion belum dibuka sesuai jadwal." },
          { status: 403 }
        );
      }
      if (exam.endTime && now > exam.endTime) {
        return NextResponse.json(
          { error: "Ujian champion sudah ditutup sesuai jadwal." },
          { status: 403 }
        );
      }
    }

    const existing = await prisma.attempt.findFirst({
      where: { userId: userSession.userId, examId },
      orderBy: { createdAt: "desc" },
    });

    if (existing && existing.status === "IN_PROGRESS") {
      // Resume: tegakkan timer dulu (bila maharoh sudah habis, state
      // yang dikembalikan sudah mencerminkan penutupan otomatisnya),
      // lalu kembalikan state penuh seperti start baru.
      await autoExpireCurrentSection(existing.id);
      const state = await buildAttemptState(existing.id);
      return NextResponse.json({
        attemptId: existing.id,
        ...state,
        resumed: true,
      });
    }

    if (existing && exam.mode === "CHAMPION") {
      return NextResponse.json(
        { error: "Anda sudah pernah mengikuti exam champion ini" },
        { status: 400 }
      );
    }

    const attempt = await prisma.attempt.create({
      data: {
        userId: userSession.userId,
        examId,
        status: "IN_PROGRESS",
        startedAt: now,
      },
    });

    const first = exam.maharohs[0];
    await startSection(attempt.id, exam.levelId, first.maharoh.name, first);

    const state = await buildAttemptState(attempt.id);
    return NextResponse.json({
      attemptId: attempt.id,
      ...state,
      resumed: false,
    });
  } catch (error) {
    console.error("Start TOAFL exam error:", error);
    return NextResponse.json(
      { error: "Gagal memulai ujian" },
      { status: 500 }
    );
  }
}
