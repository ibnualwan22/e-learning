import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireAdmin() {
  const session = await getSession();
  return session && session.role === "ADMIN" ? session : null;
}

const VALID_STATUS = ["PENDING", "VERIFIED", "REJECTED", "ALL"] as const;
type StatusFilter = "PENDING" | "VERIFIED" | "REJECTED";

// TOAFL Fase 3 — meja verifikasi Champion.
// GET ?status=PENDING|VERIFIED|REJECTED|ALL (default PENDING): daftar
// pendaftaran Champion + hitungan per status untuk tab.
// POST { id, action: "verify" | "reject", reason? }: Setujui (→ VERIFIED,
// catat verifiedBy + verifiedAt) atau Tolak (→ REJECTED + alasan wajib).
// Hanya PENDING yang bisa diproses; REJECTED harus daftar ulang dari awal
// (tidak ada jalur upload ulang — keputusan DM9 yang dipakai juga di sini).
export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "PENDING";
  if (!VALID_STATUS.includes(status as (typeof VALID_STATUS)[number])) {
    return NextResponse.json(
      { error: "Status tidak valid" },
      { status: 400 }
    );
  }

  const where: { mode: "CHAMPION"; status?: StatusFilter } = {
    mode: "CHAMPION",
  };
  if (status !== "ALL") {
    where.status = status as StatusFilter;
  }

  const [registrations, counts] = await Promise.all([
    prisma.registration.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            institution: true,
            email: true,
            whatsapp: true,
          },
        },
        level: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.registration.groupBy({
      by: ["status"],
      where: { mode: "CHAMPION" },
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({ registrations, counts });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { id, action, reason } = body;

  if (!id || (action !== "verify" && action !== "reject")) {
    return NextResponse.json(
      { error: "Permintaan tidak valid" },
      { status: 400 }
    );
  }
  if (action === "reject" && !reason?.trim()) {
    return NextResponse.json(
      { error: "Alasan penolakan wajib diisi" },
      { status: 400 }
    );
  }

  const registration = await prisma.registration.findUnique({
    where: { id },
  });
  if (!registration) {
    return NextResponse.json(
      { error: "Pendaftaran tidak ditemukan" },
      { status: 404 }
    );
  }
  if (registration.mode !== "CHAMPION") {
    return NextResponse.json(
      { error: "Hanya pendaftaran Champion yang diverifikasi di sini" },
      { status: 400 }
    );
  }
  if (registration.status !== "PENDING") {
    return NextResponse.json(
      { error: "Pendaftaran ini sudah diproses sebelumnya" },
      { status: 409 }
    );
  }

  const updated = await prisma.registration.update({
    where: { id },
    data:
      action === "verify"
        ? {
            status: "VERIFIED",
            verifiedBy: session.username,
            verifiedAt: new Date(),
            rejectionReason: null,
          }
        : {
            status: "REJECTED",
            verifiedBy: session.username,
            verifiedAt: new Date(),
            rejectionReason: reason.trim(),
          },
  });

  return NextResponse.json({ registration: updated });
}
