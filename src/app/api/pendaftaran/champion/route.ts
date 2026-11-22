import { NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/rateLimit";
import {
  validatePendaftaran,
  normalizeWhatsapp,
  hashPassword,
  isPendaftaranRateLimited,
  recordPendaftaranAttempt,
} from "@/lib/pendaftaran";
import {
  uploadPaymentProof,
  deletePaymentProof,
} from "@/lib/cloudinary";

// TOAFL Fase 3 — pendaftaran Champion: berbayar, bukti bayar wajib,
// status awal PENDING sampai admin memverifikasi di meja verifikasi.
//
// REVISI ARAH (user, 22 Nov): bukti bayar TIDAK disimpan lokal di VPS —
// diunggah ke Cloudinary (folder e-learning/payment-proofs, cloud milik
// user). `Registration.paymentProofUrl` menyimpan secure_url hasil upload.
// URL Cloudinary hanya bisa dibuka bila tahu alamat lengkapnya (public_id
// acak); tautan pratinjau di meja verifikasi tetap lewat API admin
// ber-guard (src/app/api/admin/verifikasi/bukti/[id]/route.ts).
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (isPendaftaranRateLimited(ip)) {
    return NextResponse.json(
      {
        error:
          "Terlalu banyak percobaan pendaftaran dari jaringan ini. Coba lagi dalam 15 menit.",
      },
      { status: 429 }
    );
  }
  recordPendaftaranAttempt(ip);

  let uploaded: { publicId: string; resourceType: string } | null = null;

  try {
    const form = await req.formData();
    const input = {
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
      name: String(form.get("name") ?? ""),
      institution: String(form.get("institution") ?? ""),
      email: String(form.get("email") ?? ""),
      whatsapp: String(form.get("whatsapp") ?? ""),
      levelId: String(form.get("levelId") ?? ""),
    };

    const validationError = validatePendaftaran(input);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const file = form.get("bukti");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "Bukti pembayaran wajib diunggah" },
        { status: 400 }
      );
    }
    const ext = path.extname(file.name || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: "Format bukti tidak didukung (JPG, PNG, WebP, PDF)" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Ukuran bukti maksimal 5 MB" },
        { status: 400 }
      );
    }

    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();
    const whatsapp = normalizeWhatsapp(input.whatsapp);

    const level = await prisma.level.findFirst({
      where: { id: input.levelId, isActive: true },
    });
    if (!level) {
      return NextResponse.json(
        { error: "Level yang dipilih tidak tersedia" },
        { status: 400 }
      );
    }

    // Satu orang satu akun: username, email, dan no WA semuanya unik.
    const [byUsername, byEmail, byWhatsapp] = await Promise.all([
      prisma.user.findUnique({ where: { username } }),
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { whatsapp } }),
    ]);
    if (byUsername) {
      return NextResponse.json(
        {
          error:
            "Username sudah dipakai. Silakan login dengan akun tersebut atau pilih username lain.",
        },
        { status: 400 }
      );
    }
    if (byEmail) {
      return NextResponse.json(
        {
          error:
            "Email sudah terdaftar. Silakan login dengan akun tersebut atau pakai email lain.",
        },
        { status: 400 }
      );
    }
    if (byWhatsapp) {
      return NextResponse.json(
        {
          error:
            "Nomor WA sudah terdaftar. Silakan login dengan akun tersebut atau pakai nomor lain.",
        },
        { status: 400 }
      );
    }

    // Unggah bukti ke Cloudinary dulu, baru tulis DB. Bila DB gagal,
    // aset yang sudah terunggah dihapus lagi supaya tidak ada bukti yatim.
    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await uploadPaymentProof(
      buffer,
      file.name || `bukti${ext}`,
      MIME_BY_EXT[ext] || "application/octet-stream"
    );
    uploaded = { publicId: upload.publicId, resourceType: upload.resourceType };

    const passwordHash = await hashPassword(input.password);

    // User + Registration dibuat atomik supaya tidak ada akun yatim.
    const { user } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          name: input.name.trim(),
          passwordHash,
          role: "PARTICIPANT",
          institution: input.institution.trim(),
          email,
          whatsapp,
          phone: whatsapp,
        },
      });
      await tx.registration.create({
        data: {
          userId: user.id,
          mode: "CHAMPION",
          levelId: level.id,
          status: "PENDING",
          paymentProofUrl: upload.secureUrl,
        },
      });
      return { user };
    });

    return NextResponse.json({
      ok: true,
      status: "PENDING",
      username: user.username,
    });
  } catch (error: unknown) {
    // Bila DB gagal sesudah upload, bersihkan aset di Cloudinary.
    if (uploaded) {
      await deletePaymentProof(uploaded.publicId, uploaded.resourceType).catch(
        () => {}
      );
    }
    // Balapan dua pendaftaran bersamaan: tangkap konflik unik Prisma
    // dan ubah jadi pesan yang bisa dipahami pendaftar.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "Username, email, atau nomor WA sudah terdaftar. Silakan login atau pakai data lain.",
        },
        { status: 400 }
      );
    }
    // Gagal upload Cloudinary (termasuk env belum diset) juga sampai
    // sini sebagai Error biasa — pesannya sudah ramah pendaftar.
    if (error instanceof Error) {
      console.error("Pendaftaran champion error:", error.message);
      return NextResponse.json(
        { error: "Gagal mendaftar, silakan coba lagi" },
        { status: 500 }
      );
    }
    console.error("Pendaftaran champion error:", error);
    return NextResponse.json(
      { error: "Gagal mendaftar, silakan coba lagi" },
      { status: 500 }
    );
  }
}
