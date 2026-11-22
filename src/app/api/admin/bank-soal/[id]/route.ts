import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

    if (!content?.trim()) {
      return NextResponse.json(
        { error: "Teks soal wajib diisi" },
        { status: 400 }
      );
    }

    if (!Array.isArray(options) || options.length < 2) {
      return NextResponse.json(
        { error: "Minimal harus ada 2 opsi jawaban" },
        { status: 400 }
      );
    }

    const hasCorrect = options.some(
      (opt: { isCorrect?: boolean }) => opt.isCorrect
    );
    if (!hasCorrect) {
      return NextResponse.json(
        { error: "Pilih salah satu opsi sebagai kunci jawaban benar" },
        { status: 400 }
      );
    }

    const hasEmpty = options.some(
      (opt: { content?: string; audioUrl?: string }) =>
        !opt.content?.trim() && !opt.audioUrl?.trim()
    );
    if (hasEmpty) {
      return NextResponse.json(
        { error: "Tiap opsi harus punya teks atau audio" },
        { status: 400 }
      );
    }

    // Edit soal menghapus opsi lama lalu membuat ulang (pola yang sama
    // dengan bank soal Olimpiade). Aman di Fase 2: belum ada attempt
    // TOAFL. Mulai Fase 4, soal yang sedang dipakai sesi dibekukan
    // lewat snapshot — edit bank tidak lagi memengaruhi sesi berjalan.
    await prisma.questionOption.deleteMany({
      where: { questionId: id },
    });

    const question = await prisma.question.update({
      where: { id },
      data: {
        levelId,
        maharohId,
        content: content.trim(),
        direction: direction === "LTR" ? "LTR" : "RTL",
        weight: Number(weight) || 1,
        explanation: explanation?.trim() || null,
        audioUrl: audioUrl?.trim() || null,
        options: {
          create: (options as OptionInput[]).map((opt, idx) => ({
            label: opt.label || String.fromCharCode(65 + idx),
            content: (opt.content || "").trim(),
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
    console.error("Update bank soal error:", error);
    return NextResponse.json(
      { error: "Gagal memperbarui soal" },
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
  await prisma.question.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
