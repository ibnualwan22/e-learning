import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  advanceAfterSection,
  autoExpireCurrentSection,
  buildAttemptState,
  finalizeSection,
} from "@/lib/toafl-exam";

// TOAFL Fase 4 — kumpulkan maharoh yang sedang berjalan: hitung skor
// section dari snapshot, kunci section, lalu lanjut ke maharoh berikut
// (atau finalisasi attempt bila itu maharoh terakhir).
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
      const state = await buildAttemptState(attempt.id);
      return NextResponse.json(state);
    }

    // Bila sudah lewat tenggat, penutupan berjalan lewat jalur TIME_UP.
    await autoExpireCurrentSection(attempt.id);
    attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { sections: true },
    });
    if (!attempt || attempt.status !== "IN_PROGRESS") {
      const state = await buildAttemptState(attemptId);
      return NextResponse.json(state);
    }

    const currentSection = attempt.sections.find(
      (s) =>
        s.maharohId === attempt.currentMaharohId && s.status === "IN_PROGRESS"
    );
    if (!currentSection) {
      return NextResponse.json(
        { error: "Tidak ada maharoh yang sedang berjalan" },
        { status: 400 }
      );
    }

    await finalizeSection(currentSection.id, "SUBMITTED");
    await advanceAfterSection(attempt.id);

    // Kembalikan state penuh: skor section yang baru ditutup + section
    // berikut (atau attempt SUBMITTED bila itu maharoh terakhir).
    const state = await buildAttemptState(attempt.id);
    return NextResponse.json(state);
  } catch (error) {
    console.error("Submit TOAFL section error:", error);
    return NextResponse.json(
      { error: "Gagal mengumpulkan maharoh" },
      { status: 500 }
    );
  }
}
