import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Daftar level aktif untuk formulir pendaftaran (publik — tanpa login).
// Hanya id + nama + deskripsi yang dikembalikan; tidak ada data sensitif.
export async function GET() {
  const levels = await prisma.level.findMany({
    where: { isActive: true },
    select: { id: true, name: true, description: true, order: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ levels });
}
