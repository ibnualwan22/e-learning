import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// TOAFL Fase 3 (revisi arah: Cloudinary) — menyajikan bukti bayar HANYA
// untuk admin yang login. Bukti disimpan di Cloudinary (folder
// e-learning/payment-proofs, public_id acak); route ini memverifikasi
// sesi ADMIN lalu mengarahkan (redirect) ke secure_url Cloudinary.
// Tanpa login admin, route ini menolak (403) — URL Cloudinary tidak
// pernah ditulis langsung di halaman mana pun.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const registration = await prisma.registration.findUnique({
    where: { id },
    select: { paymentProofUrl: true },
  });
  if (!registration?.paymentProofUrl) {
    return NextResponse.json(
      { error: "Bukti tidak ditemukan" },
      { status: 404 }
    );
  }

  const url = registration.paymentProofUrl;
  // Hanya URL Cloudinary yang dilayani. Format lama (nama file lokal)
  // sudah tidak dipakai lagi sejak revisi arah 22 Nov — tidak ada data
  // produksi yang memakainya.
  if (!url.startsWith("https://res.cloudinary.com/")) {
    return NextResponse.json(
      { error: "Bukti tidak ditemukan" },
      { status: 404 }
    );
  }

  return NextResponse.redirect(url);
}
