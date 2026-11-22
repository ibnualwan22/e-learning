import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  autoExpireCurrentSection,
  finalizeAttempt,
  finalizeSection,
} from "@/lib/toafl-exam";

// TOAFL Fase 4 — kumpulkan seluruh attempt: tutup maharoh berjalan bila
// masih ada (SUBMITTED, atau TIME_UP bila sudah lewat tenggat), lalu
// finalisasi skor total. Dipakai sebagai pengaman akhir; alur normal
// menutup tiap maharoh lewat submit-section.
export async function POST(req: Request) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { attemptId } = await req.json();

    let attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { sections: true },
    });

    if (!attempt || attempt.userId !== userSession.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (attempt.status !== "IN_PROGRESS") {
      return NextResponse.json({ attempt });
    }

    await autoExpireCurrentSection(attempt.id);
    attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { sections: true },
    });
    if (!attempt || attempt.status !== "IN_PROGRESS") {
      return NextResponse.json({ attempt });
    }

    const currentSection = attempt.sections.find(
      (s) =>
        s.maharohId === attempt.currentMaharohId && s.status === "IN_PROGRESS"
    );
    if (currentSection) {
      const status =
        new Date() > currentSection.expiresAt ? "TIME_UP" : "SUBMITTED";
      await finalizeSection(currentSection.id, status);
    }

    const finalized = await finalizeAttempt(
      attempt.id,
      currentSection && new Date() > currentSection.expiresAt
        ? "TIME_UP"
        : "SUBMITTED"
    );

    return NextResponse.json({ attempt: finalized });
  } catch (error) {
    console.error("Submit TOAFL exam error:", error);
    return NextResponse.json(
      { error: "Gagal mengumpulkan ujian" },
      { status: 500 }
    );
  }
}
