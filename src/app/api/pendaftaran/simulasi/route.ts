import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken, COOKIE_NAME } from "@/lib/auth";
import { getClientIp } from "@/lib/rateLimit";
import {
  validatePendaftaran,
  normalizeWhatsapp,
  hashPassword,
  isPendaftaranRateLimited,
  recordPendaftaranAttempt,
} from "@/lib/pendaftaran";

// TOAFL Fase 3 — pendaftaran Simulasi: gratis, tanpa bukti bayar.
// Akun langsung dibuat + Registration langsung VERIFIED, dan peserta
// langsung login (cookie sesi diset di respons) supaya bisa masuk portal.
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

  try {
    const body = await req.json();
    const input = {
      username: String(body?.username ?? ""),
      password: String(body?.password ?? ""),
      confirmPassword: String(body?.confirmPassword ?? ""),
      name: String(body?.name ?? ""),
      institution: String(body?.institution ?? ""),
      email: String(body?.email ?? ""),
      whatsapp: String(body?.whatsapp ?? ""),
      levelId: String(body?.levelId ?? ""),
    };

    const validationError = validatePendaftaran(input);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
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
          mode: "SIMULASI",
          levelId: level.id,
          status: "VERIFIED",
          verifiedBy: "sistem",
          verifiedAt: new Date(),
        },
      });
      return { user };
    });

    const token = await signToken({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: "PARTICIPANT",
      institution: user.institution,
    });

    const response = NextResponse.json({
      ok: true,
      status: "VERIFIED",
      username: user.username,
    });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours (sama seperti login)
    });
    return response;
  } catch (error: unknown) {
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
    console.error("Pendaftaran simulasi error:", error);
    return NextResponse.json(
      { error: "Gagal mendaftar, silakan coba lagi" },
      { status: 500 }
    );
  }
}
