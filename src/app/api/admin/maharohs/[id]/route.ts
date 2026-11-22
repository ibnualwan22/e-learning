import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  return session && session.role === "ADMIN" ? session : null;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    name,
    description,
    order,
    defaultMinutes,
    defaultAudioRepeats,
    isActive,
  } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json(
      { error: "Nama maharoh wajib diisi" },
      { status: 400 }
    );
  }
  if (
    defaultMinutes !== undefined &&
    (!Number.isFinite(Number(defaultMinutes)) || Number(defaultMinutes) < 1)
  ) {
    return NextResponse.json(
      { error: "Menit default harus minimal 1" },
      { status: 400 }
    );
  }
  if (
    defaultAudioRepeats !== undefined &&
    (!Number.isFinite(Number(defaultAudioRepeats)) ||
      Number(defaultAudioRepeats) < 0)
  ) {
    return NextResponse.json(
      { error: "Jumlah pengulangan audio tidak boleh negatif" },
      { status: 400 }
    );
  }

  try {
    const maharoh = await prisma.maharoh.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined
          ? { description: description?.trim() || null }
          : {}),
        ...(order !== undefined && Number.isFinite(Number(order))
          ? { order: Number(order) }
          : {}),
        ...(defaultMinutes !== undefined
          ? { defaultMinutes: Number(defaultMinutes) }
          : {}),
        ...(defaultAudioRepeats !== undefined
          ? { defaultAudioRepeats: Number(defaultAudioRepeats) }
          : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    return NextResponse.json({ maharoh });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Nama maharoh sudah dipakai" },
        { status: 400 }
      );
    }
    console.error("Update maharoh error:", error);
    return NextResponse.json(
      { error: "Gagal mengubah maharoh" },
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

  // Jangan hapus maharoh yang masih dipakai bank soal (soal ikut
  // kehilangan maharoh bila dihapus paksa).
  const usage = await prisma.maharoh.findUnique({
    where: { id },
    include: {
      _count: { select: { questions: true } },
    },
  });

  if (!usage) {
    return NextResponse.json(
      { error: "Maharoh tidak ditemukan" },
      { status: 404 }
    );
  }

  if (usage._count.questions > 0) {
    return NextResponse.json(
      {
        error: `Maharoh masih dipakai ${usage._count.questions} soal. Nonaktifkan saja atau pindahkan dulu.`,
      },
      { status: 400 }
    );
  }

  await prisma.maharoh.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
