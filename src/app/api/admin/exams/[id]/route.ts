import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  return session && session.role === "ADMIN" ? session : null;
}

function parseOptionalDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

type ExamMaharohInput = {
  maharohId?: string;
  minutes?: number;
  audioRepeats?: number;
  questionCount?: number;
  orderIndex?: number;
};

const examInclude = {
  level: true,
  maharohs: {
    include: { maharoh: true },
    orderBy: { orderIndex: "asc" as const },
  },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: examInclude,
  });
  if (!exam) {
    return NextResponse.json(
      { error: "Exam tidak ditemukan" },
      { status: 404 }
    );
  }
  return NextResponse.json({ exam });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      title,
      description,
      mode,
      levelId,
      isActive,
      startTime,
      endTime,
      autoSubmitOnViolation,
      maharohs,
    } = body;

    if (title !== undefined && !title?.trim()) {
      return NextResponse.json(
        { error: "Judul exam wajib diisi" },
        { status: 400 }
      );
    }
    if (mode !== undefined && mode !== "SIMULASI" && mode !== "CHAMPION") {
      return NextResponse.json(
        { error: "Mode harus SIMULASI atau CHAMPION" },
        { status: 400 }
      );
    }

    const existing = await prisma.exam.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Exam tidak ditemukan" },
        { status: 404 }
      );
    }

    const finalMode = mode ?? existing.mode;
    const start = parseOptionalDate(startTime);
    const end = parseOptionalDate(endTime);
    if (start && end && end <= start) {
      return NextResponse.json(
        { error: "Waktu selesai harus setelah waktu mulai" },
        { status: 400 }
      );
    }

    let maharohsCreate: {
      maharohId: string;
      orderIndex: number;
      minutes: number;
      audioRepeats: number;
      questionCount: number;
    }[] | undefined;

    if (maharohs !== undefined) {
      if (!Array.isArray(maharohs) || maharohs.length === 0) {
        return NextResponse.json(
          { error: "Minimal 1 maharoh harus ditambahkan" },
          { status: 400 }
        );
      }
      const seen = new Set<string>();
      for (const m of maharohs as ExamMaharohInput[]) {
        if (!m.maharohId || seen.has(m.maharohId)) {
          return NextResponse.json(
            { error: "Tiap maharoh hanya boleh muncul sekali" },
            { status: 400 }
          );
        }
        seen.add(m.maharohId);
        if (
          !Number.isFinite(Number(m.questionCount)) ||
          Number(m.questionCount) < 1
        ) {
          return NextResponse.json(
            { error: "Jumlah soal tiap maharoh minimal 1" },
            { status: 400 }
          );
        }
        if (
          m.minutes !== undefined &&
          (!Number.isFinite(Number(m.minutes)) || Number(m.minutes) < 1)
        ) {
          return NextResponse.json(
            { error: "Menit tiap maharoh minimal 1" },
            { status: 400 }
          );
        }
        if (
          m.audioRepeats !== undefined &&
          (!Number.isFinite(Number(m.audioRepeats)) ||
            Number(m.audioRepeats) < 0)
        ) {
          return NextResponse.json(
            { error: "Pengulangan audio tiap maharoh minimal 0" },
            { status: 400 }
          );
        }
      }
      const dbMaharohs = await prisma.maharoh.findMany({
        where: { id: { in: [...seen] } },
      });
      if (dbMaharohs.length !== seen.size) {
        return NextResponse.json(
          { error: "Ada maharoh yang tidak ditemukan" },
          { status: 400 }
        );
      }
      const defaults = new Map(dbMaharohs.map((m) => [m.id, m]));
      maharohsCreate = (maharohs as ExamMaharohInput[]).map((m, idx) => {
        const d = defaults.get(m.maharohId as string);
        return {
          maharohId: m.maharohId as string,
          orderIndex:
            m.orderIndex !== undefined ? Number(m.orderIndex) : idx,
          minutes:
            m.minutes !== undefined
              ? Number(m.minutes)
              : (d?.defaultMinutes ?? 45),
          audioRepeats:
            m.audioRepeats !== undefined
              ? Number(m.audioRepeats)
              : (d?.defaultAudioRepeats ?? 2),
          questionCount: Number(m.questionCount),
        };
      });
    }

    // Ganti daftar maharoh utuh (delete + create). Aman di Fase 2: belum
    // ada attempt yang merujuk ke Exam (mesin ujian baru di Fase 4).
    const exam = await prisma.$transaction(async (tx) => {
      if (maharohsCreate !== undefined) {
        await tx.examMaharoh.deleteMany({ where: { examId: id } });
      }
      return tx.exam.update({
        where: { id },
        data: {
          ...(title !== undefined ? { title: title.trim() } : {}),
          ...(description !== undefined
            ? { description: description?.trim() || null }
            : {}),
          ...(mode !== undefined ? { mode } : {}),
          ...(levelId !== undefined ? { levelId } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
          // Jadwal hanya berlaku untuk Champion.
          ...(finalMode === "CHAMPION"
            ? {
                ...(startTime !== undefined ? { startTime: start } : {}),
                ...(endTime !== undefined ? { endTime: end } : {}),
              }
            : {
                ...(startTime !== undefined || endTime !== undefined
                  ? { startTime: null, endTime: null }
                  : {}),
              }),
          ...(autoSubmitOnViolation !== undefined
            ? { autoSubmitOnViolation: Boolean(autoSubmitOnViolation) }
            : {}),
          ...(maharohsCreate !== undefined
            ? { maharohs: { create: maharohsCreate } }
            : {}),
        },
        include: examInclude,
      });
    });

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Update exam error:", error);
    return NextResponse.json(
      { error: "Gagal memperbarui exam" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.exam.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Exam tidak ditemukan" },
      { status: 404 }
    );
  }

  // Belum ada attempt TOAFL (Fase 4), jadi hapus langsung aman;
  // ExamMaharoh ikut terhapus (Cascade).
  await prisma.exam.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
