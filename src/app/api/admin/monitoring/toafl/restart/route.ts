import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { startSection } from "@/lib/toafl-exam";

// TOAFL — aksi admin di monitoring: "Mulai dari Awal". SIMULASI saja.
// POST { attemptId }
//
// Attempt lama DIHAPUS TOTAL (delete cascade Prisma: sections, answers,
// dan violations ikut terhapus), lalu dibuat attempt baru untuk user +
// exam yang sama dengan maharoh pertama dimulai. Tidak ada riwayat yang
// tersisa — pakai hanya bila admin yakin peserta harus mengulang bersih.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
    if (!attemptId) {
      return NextResponse.json(
        { error: "attemptId wajib diisi" },
        { status: 400 }
      );
    }

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
      },
    });
    if (!attempt) {
      return NextResponse.json(
        { error: "Attempt tidak ditemukan" },
        { status: 404 }
      );
    }
    if (attempt.exam.mode !== "SIMULASI") {
      return NextResponse.json(
        { error: "Aksi ini hanya untuk simulasi" },
        { status: 400 }
      );
    }
    if (!attempt.exam.isActive) {
      return NextResponse.json(
        { error: "Ujian ini sudah tidak aktif" },
        { status: 400 }
      );
    }
    const first = attempt.exam.maharohs[0];
    if (!first) {
      return NextResponse.json(
        { error: "Ujian ini belum punya maharoh" },
        { status: 400 }
      );
    }

    const { userId, examId } = attempt;
    await prisma.attempt.delete({ where: { id: attemptId } });

    const now = new Date();
    const fresh = await prisma.attempt.create({
      data: {
        userId,
        examId,
        status: "IN_PROGRESS",
        startedAt: now,
      },
    });
    await startSection(fresh.id, attempt.exam.levelId, first.maharoh.name, first);

    return NextResponse.json({ ok: true, attemptId: fresh.id });
  } catch (error) {
    console.error("TOAFL admin restart error:", error);
    return NextResponse.json(
      { error: "Gagal memulai ulang dari awal" },
      { status: 500 }
    );
  }
}
