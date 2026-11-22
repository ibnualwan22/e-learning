// TOAFL Fase 3 (revisi arah: Cloudinary, bukan lokal VPS) — upload bukti
// bayar ke Cloudinary lewat REST signed upload, tanpa SDK tambahan.
// Kredensial dari env VPS: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
// CLOUDINARY_API_SECRET (disalin dari .env e-markaz; JANGAN commit —
// .env sudah di .gitignore; JANGAN PERNAH mencetak nilainya ke log/chat).
// Cloud: dfc5djh5c (milik user; key lama ic3x7llg sudah mati sejak Okt 2026).
import crypto from "crypto";

const FOLDER = "e-learning/payment-proofs";

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  resourceType: string;
}

function getConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary belum dikonfigurasi di server");
  }
  return { cloudName, apiKey, apiSecret };
}

// Upload buffer (jpg/png/webp/pdf) ke Cloudinary, resource_type auto
// supaya PDF ikut diterima. public_id acak supaya URL tidak bisa ditebak.
export async function uploadPaymentProof(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<CloudinaryUploadResult> {
  const { cloudName, apiKey, apiSecret } = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  // Signature: parameter diurutkan alfabetis, "k=v&k=v..." + api_secret.
  const paramsToSign = `folder=${FOLDER}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign)
    .digest("hex");

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    originalName
  );
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", FOLDER);
  form.append("public_id", publicId);
  form.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    { method: "POST", body: form }
  );
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    // Jangan log isi respons mentah — hanya pesan error singkat.
    console.error(
      "Cloudinary upload error:",
      data?.error?.message || `HTTP ${res.status}`
    );
    throw new Error("Gagal mengunggah bukti pembayaran");
  }
  return {
    secureUrl: data.secure_url as string,
    publicId: data.public_id as string,
    resourceType: data.resource_type as string,
  };
}

// Hapus aset yang sudah terunggah (dipakai bila penulisan DB gagal sesudah
// upload — supaya tidak ada bukti yatim di Cloudinary).
export async function deletePaymentProof(
  publicId: string,
  resourceType: string
): Promise<void> {
  const { cloudName, apiKey, apiSecret } = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign)
    .digest("hex");

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/destroy`,
    { method: "POST", body: form }
  );
}
