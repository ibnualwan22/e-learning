import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// TOAFL Fase 3 — menyajikan bukti bayar HANYA untuk admin yang login.
// Bukti disimpan di uploads/payment-proofs/ (di luar public/) sehingga
// tidak bisa dibuka lewat URL langsung; route ini satu-satunya jalan masuk,
// dijaga cookie sesi ADMIN. Content-Disposition inline supaya gambar/PDF
// tampil sebagai pratinjau di tab baru, bukan terunduh paksa.
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

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

  // paymentProofUrl hanya berisi nama file acak (tanpa path). Tolak bila
  // ada pemisah direktori supaya tidak bisa dipakai path traversal.
  const filename = registration.paymentProofUrl;
  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..")
  ) {
    return NextResponse.json(
      { error: "Bukti tidak ditemukan" },
      { status: 404 }
    );
  }
  const ext = path.extname(filename).toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    return NextResponse.json(
      { error: "Bukti tidak ditemukan" },
      { status: 404 }
    );
  }

  const filePath = path.join(
    process.cwd(),
    "uploads",
    "payment-proofs",
    filename
  );
  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Bukti tidak ditemukan" },
      { status: 404 }
    );
  }
}
