// TOAFL Fase 3 — helper bersama pendaftaran Simulasi + Champion.
// Validasi, normalisasi, dan pembatas percobaan pendaftaran per IP.
import bcrypt from "bcryptjs";

export interface PendaftaranInput {
  username: string;
  password: string;
  confirmPassword: string;
  name: string;
  institution: string;
  email: string;
  whatsapp: string;
  levelId: string;
}

// Normalisasi nomor WA ke format digit internasional tanpa "+":
// "0812..." -> "62812...", "+62 812..." -> "62812...".
export function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mengembalikan pesan error (Bahasa Indonesia) bila ada yang tidak valid,
// atau null bila semua lolos. Dipakai kedua mode supaya aturannya sama.
export function validatePendaftaran(input: PendaftaranInput): string | null {
  const username = input.username?.trim() || "";
  if (username.length < 3 || username.length > 30) {
    return "Username minimal 3 dan maksimal 30 karakter";
  }
  if (!USERNAME_RE.test(username)) {
    return "Username hanya boleh huruf, angka, titik, garis bawah, dan strip";
  }
  if (!input.password || input.password.length < 6) {
    return "Password minimal 6 karakter";
  }
  if (input.password !== input.confirmPassword) {
    return "Verifikasi password tidak cocok";
  }
  if (!input.name?.trim()) {
    return "Nama lengkap wajib diisi";
  }
  if (!input.institution?.trim()) {
    return "Asal instansi wajib diisi";
  }
  const email = input.email?.trim().toLowerCase() || "";
  if (!EMAIL_RE.test(email)) {
    return "Format email tidak valid";
  }
  const whatsapp = normalizeWhatsapp(input.whatsapp || "");
  if (whatsapp.length < 9 || whatsapp.length > 15) {
    return "Nomor WA tidak valid (9–15 digit)";
  }
  if (!input.levelId?.trim()) {
    return "Level wajib dipilih";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Pembatas percobaan pendaftaran per IP (in-memory, per proses server):
// maks 30 percobaan per 15 menit. Satu lab sekolah di balik satu IP publik
// tetap bisa mendaftar massal, tapi spam bot tertahan.
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 30;
const WINDOW_MS = 15 * 60 * 1000;

export function isPendaftaranRateLimited(ip: string): boolean {
  const bucket = buckets.get(ip);
  if (!bucket) return false;
  if (Date.now() > bucket.resetAt) {
    buckets.delete(ip);
    return false;
  }
  return bucket.count >= MAX_ATTEMPTS;
}

export function recordPendaftaranAttempt(ip: string): void {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (buckets.size > 1000) {
    for (const [key, value] of buckets) {
      if (now > value.resetAt) buckets.delete(key);
    }
  }
}
