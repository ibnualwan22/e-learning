import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseExcel, findColumn } from "@/lib/excel";
import { getTextDirection } from "@/lib/text-direction";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const OPTION_LABELS = ["A", "B", "C", "D"];

async function requireAdmin(): Promise<boolean> {
  const session = await getSession();
  return !!session && session.role === "ADMIN";
}

type PreviewOption = { label: string; html: string; plain: string };
type PreviewRow = {
  index: number;
  level: string;
  levelId: string | null;
  maharoh: string;
  maharohId: string | null;
  weight: number;
  contentHtml: string;
  options: PreviewOption[];
  keyLetter: string;
  explanationHtml: string;
  status: "valid" | "error";
  errors: string[];
};

// Impor soal TOAFL dari Excel (Fase 6). Kolom: Level | Maharoh | Bobot |
// Soal | Opsi A | Opsi B | Opsi C | Opsi D | Kunci | Pembahasan.
// Level dan Maharoh dicocokkan dengan nama yang sudah ada di admin —
// TIDAK dibuat otomatis (Level/Maharoh punya urutan + menit default yang
// diatur admin). Arah tulisan (RTL/LTR) dideteksi otomatis dari isi,
// sama seperti form manual. Jumlah opsi fleksibel 2–4: hanya kolom opsi
// yang terisi yang dibuat (soal dengan opsi sampai B atau C saja tampil
// sampai B atau C saja di bank soal dan halaman ujian).
// POST multipart (file .xlsx) -> pratinjau, tanpa menulis apa pun.
// POST JSON { rows: PreviewRow[] } -> konfirmasi: buat soal yang valid.
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      return await handlePreview(req);
    }
    return await handleConfirm(req);
  } catch (error) {
    console.error("Import bank soal error:", error);
    return NextResponse.json(
      { error: "Gagal memproses impor soal" },
      { status: 500 }
    );
  }
}

async function handlePreview(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "File Excel (.xlsx) wajib diunggah" },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Ukuran file melebihi 5MB" },
      { status: 400 }
    );
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Hanya file .xlsx yang didukung" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { headers, rows } = await parseExcel(buffer);

  const soalCol = findColumn(headers, ["soal", "pertanyaan", "teks soal"]);
  const kunciCol = findColumn(headers, [
    "kunci",
    "kunci jawaban",
    "jawaban benar",
  ]);
  const levelCol = findColumn(headers, ["level", "tingkat"]);
  const maharohCol = findColumn(headers, ["maharoh", "maharah", "skill"]);
  const bobotCol = findColumn(headers, ["bobot", "nilai", "skor"]);
  const bahasCol = findColumn(headers, [
    "pembahasan",
    "penjelasan",
    "explanation",
  ]);
  const opsiCols: Record<string, string | null> = {};
  for (const label of OPTION_LABELS) {
    opsiCols[label] = findColumn(headers, [
      `opsi ${label.toLowerCase()}`,
      `pilihan ${label.toLowerCase()}`,
      label.toLowerCase(),
    ]);
  }

  const missing: string[] = [];
  if (!soalCol) missing.push("Soal");
  if (!kunciCol) missing.push("Kunci");
  if (!levelCol) missing.push("Level");
  if (!maharohCol) missing.push("Maharoh");
  if (!opsiCols.A || !opsiCols.B) missing.push("Opsi A dan Opsi B");
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Kolom wajib tidak ditemukan: ${missing.join(", ")}`,
        headers,
      },
      { status: 400 }
    );
  }

  const [levels, maharohs] = await Promise.all([
    prisma.level.findMany({ select: { id: true, name: true } }),
    prisma.maharoh.findMany({ select: { id: true, name: true } }),
  ]);
  const levelByName = new Map(levels.map((l) => [l.name.toLowerCase(), l.id]));
  const maharohByName = new Map(
    maharohs.map((m) => [m.name.toLowerCase(), m.id])
  );

  const preview: PreviewRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const contentCell = row[soalCol as string];
    const errors: string[] = [];
    if (!contentCell?.plain) errors.push("Soal kosong");

    // Opsi variabel: hanya opsi yang terisi yang disimpan dan ditampilkan
    // (soal boleh punya 2, 3, atau 4 opsi — bila file hanya sampai B atau C,
    // kotak D dst tidak dibuat). Kolom opsi yang kosong dilewati di sini,
    // bukan dibuat sebagai opsi kosong.
    const options: PreviewOption[] = [];
    for (const label of OPTION_LABELS) {
      const col = opsiCols[label];
      const cell = col ? row[col] : undefined;
      if (!cell?.plain) continue;
      options.push({ label, html: cell.html, plain: cell.plain });
    }
    const filled = options;
    if (filled.length < 2) errors.push("Minimal 2 opsi harus terisi");

    const keyLetter = (row[kunciCol as string]?.plain ?? "")
      .toUpperCase()
      .trim();
    if (!OPTION_LABELS.includes(keyLetter)) {
      errors.push("Kunci harus huruf A/B/C/D");
    } else {
      const keyOpt = options.find((o) => o.label === keyLetter);
      if (!keyOpt?.plain) errors.push(`Opsi ${keyLetter} yang jadi kunci kosong`);
    }

    let weight = 1;
    if (bobotCol) {
      const raw = row[bobotCol]?.plain ?? "";
      if (raw) {
        const parsed = Number(raw.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed <= 0) {
          errors.push("Bobot harus angka lebih dari 0");
        } else {
          weight = parsed;
        }
      }
    }

    const levelName = levelCol ? row[levelCol]?.plain ?? "" : "";
    const levelId = levelName
      ? levelByName.get(levelName.toLowerCase()) ?? null
      : null;
    if (!levelName) errors.push("Level kosong");
    else if (!levelId) errors.push(`Level "${levelName}" tidak ditemukan`);

    const maharohName = maharohCol ? row[maharohCol]?.plain ?? "" : "";
    const maharohId = maharohName
      ? maharohByName.get(maharohName.toLowerCase()) ?? null
      : null;
    if (!maharohName) errors.push("Maharoh kosong");
    else if (!maharohId)
      errors.push(`Maharoh "${maharohName}" tidak ditemukan`);

    preview.push({
      index: i + 2,
      level: levelName,
      levelId,
      maharoh: maharohName,
      maharohId,
      weight,
      contentHtml: contentCell?.html ?? "",
      options,
      keyLetter,
      explanationHtml: bahasCol ? row[bahasCol]?.html ?? "" : "",
      status: errors.length === 0 ? "valid" : "error",
      errors,
    });
  }

  return NextResponse.json({ rows: preview });
}

async function handleConfirm(req: Request) {
  const body = await req.json();
  const inputRows: PreviewRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (inputRows.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada baris untuk diimpor" },
      { status: 400 }
    );
  }

  let created = 0;
  const skipped: { index: number; reason: string }[] = [];

  for (const row of inputRows) {
    if (row.status !== "valid" || !row.levelId || !row.maharohId) {
      skipped.push({ index: row.index, reason: "Baris bermasalah, dilewati" });
      continue;
    }
    const filled = row.options.filter((o) => o.plain);
    if (filled.length < 2 || !row.contentHtml) {
      skipped.push({ index: row.index, reason: "Baris tidak valid" });
      continue;
    }
    await prisma.question.create({
      data: {
        levelId: row.levelId,
        maharohId: row.maharohId,
        categoryId: null,
        content: row.contentHtml,
        direction: getTextDirection(row.contentHtml),
        weight: row.weight,
        explanation: row.explanationHtml || null,
        audioUrl: null,
        options: {
          create: filled.map((o) => ({
            label: o.label,
            content: o.html,
            direction: getTextDirection(o.html),
            isCorrect: o.label === row.keyLetter,
            contentType: "TEXT",
            audioUrl: null,
          })),
        },
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped });
}
