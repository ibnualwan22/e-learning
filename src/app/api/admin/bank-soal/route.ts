import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { decodeHtmlEntities } from "@/lib/decodeHtml";

async function requireAdmin() {
  const session = await getSession();
  return session && session.role === "ADMIN" ? session : null;
}

type OptionInput = {
  label?: string;
  content?: string;
  direction?: string;
  isCorrect?: boolean;
  contentType?: string;
  audioUrl?: string;
};

function parseOptions(options: unknown): OptionInput[] | null {
  if (!Array.isArray(options)) return null;
  // Opsi kosong dibuang, bukan ditolak — soal boleh punya 2, 3, atau 4
  // opsi. Label diurutkan ulang (A, B, C...) supaya tidak ada lompatan
  // bila opsi tengah yang kosong. Sisanya harus >= 2 dan salah satunya
  // kunci jawaban.
  const cleaned = (options as OptionInput[])
    .filter((opt) => opt.content?.trim() || opt.audioUrl?.trim())
    .map((opt, idx) => ({
      ...opt,
      label: String.fromCharCode(65 + idx),
    }));
  if (cleaned.length < 2) return null;
  const hasCorrect = cleaned.some((opt) => opt.isCorrect);
  if (!hasCorrect) return null;
  return cleaned;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const levelId = searchParams.get("levelId") || undefined;
  const maharohId = searchParams.get("maharohId") || undefined;

  // Bank TOAFL = soal yang punya level (soal Olimpiade lama yang hanya
  // punya kategori tidak tampil di sini).
  const questions = await prisma.question.findMany({
    where: {
      levelId: { not: null },
      ...(levelId ? { levelId } : {}),
      ...(maharohId ? { maharohId } : {}),
    },
    include: {
      level: true,
      maharoh: true,
      options: { orderBy: { label: "asc" } },
    },
    // Urutan SAMAKAN dengan papan ujian (25 Nov 2026): tertua dulu,
    // supaya #1 di bank soal = Soal 1 di papan ujian. Sebelumnya desc
    // (terbaru dulu) sehingga soal tertua jatuh di paling bawah daftar.
    orderBy: { createdAt: "asc" },
  });

  const levels = await prisma.level.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  const maharohs = await prisma.maharoh.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ questions, levels, maharohs });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      levelId,
      maharohId,
      content,
      direction = "RTL",
      weight = 1,
      explanation,
      audioUrl,
      options,
    } = body;

    if (!levelId || !maharohId) {
      return NextResponse.json(
        { error: "Level dan maharoh wajib dipilih" },
        { status: 400 }
      );
    }

    const [level, maharoh] = await Promise.all([
      prisma.level.findUnique({ where: { id: levelId } }),
      prisma.maharoh.findUnique({ where: { id: maharohId } }),
    ]);
    if (!level || !maharoh) {
      return NextResponse.json(
        { error: "Level atau maharoh tidak ditemukan" },
        { status: 400 }
      );
    }

    if (!content?.trim()) {
      return NextResponse.json(
        { error: "Teks soal wajib diisi" },
        { status: 400 }
      );
    }

    const cleanOptions = parseOptions(options);
    if (!cleanOptions) {
      return NextResponse.json(
        {
          error:
            "Minimal 2 opsi jawaban, salah satu harus benar, dan tiap opsi harus punya teks atau audio",
        },
        { status: 400 }
      );
    }

    const question = await prisma.question.create({
      data: {
        levelId,
        maharohId,
        categoryId: null,
        content: decodeHtmlEntities(content.trim()),
        direction: direction === "LTR" ? "LTR" : "RTL",
        weight: Number(weight) || 1,
        explanation: decodeHtmlEntities(explanation?.trim() || "") || null,
        audioUrl: audioUrl?.trim() || null,
        options: {
          create: cleanOptions.map((opt, idx) => ({
            label: opt.label || String.fromCharCode(65 + idx),
            content: decodeHtmlEntities((opt.content || "").trim()),
            direction:
              opt.direction === "LTR"
                ? "LTR"
                : opt.direction === "RTL"
                  ? "RTL"
                  : direction === "LTR"
                    ? "LTR"
                    : "RTL",
            isCorrect: Boolean(opt.isCorrect),
            contentType:
              opt.contentType === "AUDIO" ? "AUDIO" : "TEXT",
            audioUrl: opt.audioUrl?.trim() || null,
          })),
        },
      },
      include: {
        level: true,
        maharoh: true,
        options: { orderBy: { label: "asc" } },
      },
    });

    return NextResponse.json({ question });
  } catch (error) {
    console.error("Create bank soal error:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan soal" },
      { status: 500 }
    );
  }
}
