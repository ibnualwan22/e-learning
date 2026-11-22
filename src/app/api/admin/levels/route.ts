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

  const levels = await prisma.level.findMany({
    include: {
      _count: { select: { questions: true, registrations: true } },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ levels });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, order, isActive } = body;

  if (!name?.trim()) {
    return NextResponse.json(
      { error: "Nama level wajib diisi" },
      { status: 400 }
    );
  }

  try {
    const level = await prisma.level.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        order: Number.isFinite(Number(order)) ? Number(order) : 0,
        isActive: isActive === undefined ? true : Boolean(isActive),
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
    console.error("Create level error:", error);
    return NextResponse.json(
      { error: "Gagal menambahkan level" },
      { status: 500 }
    );
  }
}
