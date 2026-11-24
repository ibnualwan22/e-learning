import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";

// Template Excel impor soal TOAFL. Hanya sheet pertama ("Soal") yang
// dibaca importer; sheet "Contoh" dan "Petunjuk" tidak ikut terimpor.
// Kolom: Level | Maharoh | Bobot | Soal | Opsi A | Opsi B | Opsi C |
// Opsi D | Kunci | Pembahasan. Level dan Maharoh harus sama persis
// dengan nama yang sudah dibuat di admin (tidak dibuat otomatis).
// Arah tulisan dideteksi otomatis dari isi soal.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Soal");
  sheet.addRow([
    "Level",
    "Maharoh",
    "Bobot",
    "Soal",
    "Opsi A",
    "Opsi B",
    "Opsi C",
    "Opsi D",
    "Kunci",
    "Pembahasan",
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [
    { width: 18 },
    { width: 16 },
    { width: 10 },
    { width: 50 },
    { width: 30 },
    { width: 30 },
    { width: 30 },
    { width: 30 },
    { width: 10 },
    { width: 40 },
  ];

  const example = workbook.addWorksheet("Contoh");
  example.addRow([
    "Level",
    "Maharoh",
    "Bobot",
    "Soal",
    "Opsi A",
    "Opsi B",
    "Opsi C",
    "Opsi D",
    "Kunci",
    "Pembahasan",
  ]);
  example.getRow(1).font = { bold: true };
  const row = example.addRow([
    "Level 1",
    "Istima'",
    1,
    "",
    "Kitab",
    "Pena",
    "Meja",
    "Rumah",
    "A",
    "Kata yang ditebalkan pada soal adalah kata yang ditanyakan.",
  ]);
  // Sel soal memakai rich text: kata "الكتاب" ditebalkan, sisanya biasa.
  row.getCell(4).value = {
    richText: [
      { text: "Apa arti kata ", font: {} },
      { text: "الكتاب", font: { bold: true } },
      { text: "?", font: {} },
    ],
  };
  example.columns = sheet.columns;

  const guide = workbook.addWorksheet("Petunjuk");
  guide.addRow(["Petunjuk impor soal TOAFL"]);
  guide.addRow(["1. Isi sheet Soal. Kolom Level, Maharoh, Soal, Opsi A, Opsi B, dan Kunci wajib diisi."]);
  guide.addRow(["2. Level dan Maharoh harus sama persis dengan nama di menu Level TOAFL dan Maharoh. Nama yang tidak ditemukan membuat baris ditolak."]);
  guide.addRow(["3. Kunci diisi satu huruf: A, B, C, atau D, dan opsi tersebut harus terisi."]);
  guide.addRow(["4. Bobot kosong berarti 1."]);
  guide.addRow(["5. Arah tulisan (RTL/LTR) dideteksi otomatis dari isi soal dan opsi."]);
  guide.addRow(["6. Format tebal/garis bawah/miring pada sel akan ikut terimpor. Karakter liar hasil copy-paste dibersihkan otomatis; harakat dipertahankan."]);
  guide.addRow(["7. Audio soal (Istima') tidak bisa diimpor dari Excel — tambahkan lewat tombol Tambah Soal atau Edit."]);
  guide.addRow(["8. Sheet Contoh hanya contoh dan tidak ikut terimpor."]);
  guide.columns = [{ width: 120 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="template-soal-toafl.xlsx"',
    },
  });
}
