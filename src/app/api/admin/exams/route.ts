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

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const exams = await prisma.exam.findMany({
    include: examInclude,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ exams });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
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

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Judul exam wajib diisi" },
        { status: 400 }
      );
    }
    if (mode !== "SIMULASI" && mode !== "CHAMPION") {
      return NextResponse.json(
        { error: "Mode harus SIMULASI atau CHAMPION" },
        { status: 400 }
      );
    }
    if (!levelId) {
      return NextResponse.json(
        { error: "Level wajib dipilih" },
        { status: 400 }
      );
    }

    const level = await prisma.level.findUnique({ where: { id: levelId } });
    if (!level) {
      return NextResponse.json(
        { error: "Level tidak ditemukan" },
        { status: 400 }
      );
    }

    const start = parseOptionalDate(startTime);
    const end = parseOptionalDate(endTime);
    if (start && end && end <= start) {
      return NextResponse.json(
        { error: "Waktu selesai harus setelah waktu mulai" },
        { status: 400 }
      );
    }

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
      if (!Number.isFinite(Number(m.questionCount)) || Number(m.questionCount) < 1) {
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
        (!Number.isFinite(Number(m.audioRepeats)) || Number(m.audioRepeats) < 0)
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
    const defaults = new Map(
      dbMaharohs.map((m) => [m.id, m])
    );

    const exam = await prisma.exam.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        mode,
        levelId,
        isActive: isActive === undefined ? false : Boolean(isActive),
        // Jadwal hanya berlaku untuk Champion; Simulasi null = kapan saja.
        startTime: mode === "CHAMPION" ? start : null,
        endTime: mode === "CHAMPION" ? end : null,
        autoSubmitOnViolation:
          autoSubmitOnViolation === undefined
            ? mode === "SIMULASI"
            : Boolean(autoSubmitOnViolation),
        maharohs: {
          create: (maharohs as ExamMaharohInput[]).map((m, idx) => {
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
          }),
        },
      },
      include: examInclude,
    });

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Create exam error:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan exam" },
      { status: 500 }
    );
  }
}
