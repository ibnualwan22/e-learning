import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  return session && session.role === "ADMIN" ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const maharohs = await prisma.maharoh.findMany({
    include: {
      _count: { select: { questions: true } },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ maharohs });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const {
    name,
    description,
    order,
    defaultMinutes,
    defaultAudioRepeats,
    isActive,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json(
      { error: "Nama maharoh wajib diisi" },
      { status: 400 }
    );
  }

  const minutes =
    defaultMinutes === undefined ? 45 : Number(defaultMinutes);
  const repeats =
    defaultAudioRepeats === undefined ? 2 : Number(defaultAudioRepeats);

  if (!Number.isFinite(minutes) || minutes < 1) {
    return NextResponse.json(
      { error: "Menit default harus minimal 1" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(repeats) || repeats < 0) {
    return NextResponse.json(
      { error: "Jumlah pengulangan audio tidak boleh negatif" },
      { status: 400 }
    );
  }

  try {
    const maharoh = await prisma.maharoh.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        order: Number.isFinite(Number(order)) ? Number(order) : 0,
        defaultMinutes: minutes,
        defaultAudioRepeats: repeats,
        isActive: isActive === undefined ? true : Boolean(isActive),
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
    console.error("Create maharoh error:", error);
    return NextResponse.json(
      { error: "Gagal menambahkan maharoh" },
      { status: 500 }
    );
  }
}
