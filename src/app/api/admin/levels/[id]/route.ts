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
  const { name, description, order, isActive } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json(
      { error: "Nama level wajib diisi" },
      { status: 400 }
    );
  }

  try {
    const level = await prisma.level.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined
          ? { description: description?.trim() || null }
          : {}),
        ...(order !== undefined && Number.isFinite(Number(order))
          ? { order: Number(order) }
          : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    return NextResponse.json({ level });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Nama level sudah dipakai" },
        { status: 400 }
      );
    }
    console.error("Update level error:", error);
    return NextResponse.json(
      { error: "Gagal mengubah level" },
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

  // Jangan hapus level yang masih dipakai: registrasi peserta ikut
  // terhapus (Cascade) bila level dihapus, soal ikut kehilangan level.
  const usage = await prisma.level.findUnique({
    where: { id },
    include: {
      _count: { select: { questions: true, registrations: true } },
    },
  });

  if (!usage) {
    return NextResponse.json(
      { error: "Level tidak ditemukan" },
      { status: 404 }
    );
  }

  if (
    usage._count.registrations > 0 ||
    usage._count.questions > 0
  ) {
    return NextResponse.json(
      {
        error: `Level masih dipakai (${usage._count.registrations} pendaftaran, ${usage._count.questions} soal). Nonaktifkan saja atau pindahkan dulu.`,
      },
      { status: 400 }
    );
  }

  await prisma.level.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
