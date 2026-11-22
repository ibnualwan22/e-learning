import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Memulai seeding database E-learning Markaz Arabiyah...");

  const adminPassword = await bcrypt.hash("admin123", 10);
  const participantPassword = await bcrypt.hash("peserta123", 10);

  // 1. Buat Akun Admin (rebrand Fase 1: nama + institusi E-learning;
  // update:{} diisi supaya seed ulang ikut menerapkan rebrand dan
  // mengembalikan sandi tes admin123)
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      name: "Administrator E-learning",
      institution: "Markaz Arabiyah",
      passwordHash: adminPassword,
    },
    create: {
      username: "admin",
      name: "Administrator E-learning",
      passwordHash: adminPassword,
      role: "ADMIN",
      institution: "Markaz Arabiyah",
    },
  });

  // 2. Buat Akun Peserta Contoh
  const participantsData = [
    {
      username: "peserta01",
      name: "Ahmad Zaki Al-Faruq",
      institution: "PP. Lirboyo Kediri",
      phone: "081234567801",
    },
    {
      username: "peserta02",
      name: "Fatimah Az-Zahra",
      institution: "PP. Al-Munawwir Krapyak",
      phone: "081234567802",
    },
    {
      username: "peserta03",
      name: "Muhammad Ibnu Malik",
      institution: "PP. Sidogiri Pasuruan",
      phone: "081234567803",
    },
    {
      username: "peserta04",
      name: "Nabila Khairunnisa",
      institution: "PP. Darussalam Gontor",
      phone: "081234567804",
    },
  ];

  for (const p of participantsData) {
    await prisma.user.upsert({
      where: { username: p.username },
      update: {},
      create: {
        ...p,
        passwordHash: participantPassword,
        role: "PARTICIPANT",
      },
    });
  }

  // 3. Akun peserta tes (Fase 1) — username + sandi mudah untuk testing
  const pesertaTes = await prisma.user.upsert({
    where: { username: "peserta" },
    update: {
      name: "Peserta Tes TOAFL",
      institution: "Markaz Arabiyah",
      passwordHash: participantPassword,
    },
    create: {
      username: "peserta",
      name: "Peserta Tes TOAFL",
      passwordHash: participantPassword,
      role: "PARTICIPANT",
      institution: "Markaz Arabiyah",
    },
  });

  // 4. Level TOAFL (Fase 1)
  const levelsData = [
    {
      name: "Level 1 Mubtadi'",
      description: "Tingkat dasar",
      order: 1,
    },
    {
      name: "Level 2 Mutawassith",
      description: "Tingkat menengah",
      order: 2,
    },
    {
      name: "Level 3 Mutaqaddim",
      description: "Tingkat lanjut",
      order: 3,
    },
  ];

  const levels: Record<string, { id: string }> = {};
  for (const l of levelsData) {
    levels[l.name] = await prisma.level.upsert({
      where: { name: l.name },
      update: { description: l.description, order: l.order },
      create: { ...l, isActive: true },
    });
  }

  // 5. Maharoh TOAFL (Fase 1) — menit + pengulangan audio default
  const maharohsData = [
    {
      name: "Istima'",
      description: "Mendengarkan",
      order: 1,
      defaultMinutes: 50,
      defaultAudioRepeats: 2,
    },
    {
      name: "Qawa'id",
      description: "Tata bahasa Arab",
      order: 2,
      defaultMinutes: 40,
      defaultAudioRepeats: 2,
    },
    {
      name: "Qira'ah",
      description: "Membaca",
      order: 3,
      defaultMinutes: 50,
      defaultAudioRepeats: 2,
    },
  ];

  for (const m of maharohsData) {
    await prisma.maharoh.upsert({
      where: { name: m.name },
      update: {
        description: m.description,
        order: m.order,
        defaultMinutes: m.defaultMinutes,
        defaultAudioRepeats: m.defaultAudioRepeats,
      },
      create: { ...m, isActive: true },
    });
  }

  // 6. Registrasi SIMULASI peserta tes (langsung VERIFIED) di Level 1
  await prisma.registration.upsert({
    where: {
      userId_mode_levelId: {
        userId: pesertaTes.id,
        mode: "SIMULASI",
        levelId: levels["Level 1 Mubtadi'"].id,
      },
    },
    update: { status: "VERIFIED" },
    create: {
      userId: pesertaTes.id,
      mode: "SIMULASI",
      levelId: levels["Level 1 Mubtadi'"].id,
      status: "VERIFIED",
    },
  });

  console.log("✅ Seeding selesai!");
  console.log(`   - Admin Login   : admin / admin123`);
  console.log(`   - Peserta Login : peserta / peserta123 (juga peserta01-04 / peserta123)`);
  console.log(`   - Level         : Level 1 Mubtadi', Level 2 Mutawassith, Level 3 Mutaqaddim`);
  console.log(`   - Maharoh       : Istima' (50 mnt), Qawa'id (40 mnt), Qira'ah (50 mnt)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
