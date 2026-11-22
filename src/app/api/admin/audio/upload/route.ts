import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { getSession } from "@/lib/auth";

// TOAFL Fase 2 — penyimpanan audio: file lokal di VPS (public/uploads/
// audio/), dilayani Next sebagai static. Asumsi sementara sampai user
// memutuskan Cloudinary vs lokal (§12 poin 5 plan). File upload TIDAK
// masuk git (lihat .gitignore) dan tidak ikut terhapus saat deploy ulang
// (deploy hanya mengganti kode + build .next).
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXT = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".webm",
  ".aac",
]);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "File audio wajib diunggah" },
        { status: 400 }
      );
    }

    const upload = file;
    const ext = path.extname(upload.name || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: "Format audio tidak didukung (mp3, wav, m4a, ogg, webm, aac)" },
        { status: 400 }
      );
    }
    if (upload.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Ukuran file maksimal 10 MB" },
        { status: 400 }
      );
    }

    const dir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "audio"
    );
    await fs.mkdir(dir, { recursive: true });

    const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    const buffer = Buffer.from(await upload.arrayBuffer());
    await fs.writeFile(path.join(dir, name), buffer);

    return NextResponse.json({ url: `/uploads/audio/${name}` });
  } catch (error) {
    console.error("Upload audio error:", error);
    return NextResponse.json(
      { error: "Gagal mengunggah audio" },
      { status: 500 }
    );
  }
}
