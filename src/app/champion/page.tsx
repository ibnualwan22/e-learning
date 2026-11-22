"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  LogIn,
  ArrowLeft,
  CheckCircle2,
  UserPlus,
  Clock,
} from "lucide-react";

interface LevelOption {
  id: string;
  name: string;
  description: string | null;
}

// TOAFL Fase 3 — halaman pendaftaran Champion: form identitas + bukti
// bayar (wajib). Status awal PENDING — peserta menunggu verifikasi admin
// sebelum bisa ikut sesuai jadwal. Nominal + rekening tujuan BELUM
// diputuskan (§12 poin 2 plan): halaman ini TIDAK mengarang angka —
// peserta diarahkan mengikuti pengumuman panitia.
export default function ChampionPage() {
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [levelId, setLevelId] = useState("");
  const [bukti, setBukti] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successUsername, setSuccessUsername] = useState("");

  useEffect(() => {
    async function loadLevels() {
      try {
        const res = await fetch("/api/pendaftaran/levels");
        const data = await res.json();
        setLevels(data.levels || []);
        if (data.levels?.length === 1) setLevelId(data.levels[0].id);
      } finally {
        setLevelsLoading(false);
      }
    }
    loadLevels();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!bukti) {
      setError("Bukti pembayaran wajib diunggah");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("username", username);
      form.append("password", password);
      form.append("confirmPassword", confirmPassword);
      form.append("name", name);
      form.append("institution", institution);
      form.append("email", email);
      form.append("whatsapp", whatsapp);
      form.append("levelId", levelId);
      form.append("bukti", bukti);

      const res = await fetch("/api/pendaftaran/champion", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal mendaftar, silakan coba lagi");
        return;
      }
      setSuccessUsername(data.username || username);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-bold text-zinc-700 hover:text-zinc-900"
          >
            <ArrowLeft className="w-4 h-4" />
            E-learning Markaz Arabiyah
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold transition"
          >
            <LogIn className="w-4 h-4" />
            Login Peserta
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 py-12 w-full">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-sm font-bold">
          <Trophy className="w-4 h-4" />
          TOAFL Champion
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-4">
          Kompetisi TOAFL Terbuka
        </h1>
        <p className="text-zinc-600 leading-relaxed mt-3">
          TOAFL Champion adalah ajang kompetisi bahasa Arab terbuka: peserta
          mendaftar dengan bukti pembayaran, diverifikasi admin, lalu
          mengerjakan ujian sesuai jadwal yang ditetapkan. Satu kali
          percobaan, leaderboard per level, dan sertifikat setelah pengumuman
          resmi.
        </p>

        <ul className="mt-6 space-y-2.5 text-zinc-700">
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-yellow-600 shrink-0" />
            Berbayar — daftar dengan bukti pembayaran, diverifikasi admin dulu
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-yellow-600 shrink-0" />
            Jadwal tetap, satu kali percobaan
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-yellow-600 shrink-0" />
            Pelanggaran hanya dicatat untuk monitoring (tanpa auto-submit);
            detail waktu per soal tampil di monitoring admin
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-yellow-600 shrink-0" />
            Leaderboard per level + sertifikat setelah pengumuman resmi
          </li>
        </ul>

        {successUsername ? (
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-5">
            <p className="font-bold text-yellow-900 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pendaftaran diterima — menunggu verifikasi admin
            </p>
            <p className="text-sm text-yellow-800 mt-1">
              Akun <strong>@{successUsername}</strong> sudah dibuat dan
              bukti pembayaranmu sudah terkirim. Admin akan memeriksa
              pembayaranmu; setelah disetujui, kamu bisa login dan mengikuti
              ujian sesuai jadwal champion.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold transition"
            >
              <LogIn className="w-4 h-4" />
              Login Peserta
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-8 bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-4"
          >
            <h2 className="text-lg font-bold flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-yellow-600" />
              Daftar TOAFL Champion
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
              <p className="font-bold text-yellow-900">Pembayaran</p>
              <p className="mt-1">
                Nominal dan rekening tujuan akan diumumkan panitia. Bila
                sudah membayar sesuai pengumuman, unggah bukti pembayarannya
                di formulir ini (JPG, PNG, WebP, atau PDF — maks 5 MB).
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Username
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="mis. ahmad123"
                  autoComplete="username"
                  className={inputClass}
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Huruf, angka, titik, garis bawah, strip. Minimal 3 karakter.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Nama Lengkap
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="mis. Ahmad Zaki"
                  autoComplete="name"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Verifikasi Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password"
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Asal Instansi / Sekolah
              </label>
              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="mis. PP. Lirboyo Kediri"
                autoComplete="organization"
                className={inputClass}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mis. ahmad@email.com"
                  autoComplete="email"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Nomor WA
                </label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="mis. 081234567890"
                  autoComplete="tel"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Level TOAFL
              </label>
              <select
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
                disabled={levelsLoading}
                className={inputClass}
              >
                <option value="">
                  {levelsLoading ? "Memuat level..." : "Pilih level"}
                </option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                    {level.description ? ` — ${level.description}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">
                Tiap level punya bank soal sendiri. Pilih sesuai kemampuanmu.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Bukti Pembayaran (wajib)
              </label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setBukti(e.target.files?.[0] ?? null)}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-yellow-600 file:text-white file:text-xs file:font-bold file:cursor-pointer"
              />
              <p className="text-xs text-zinc-500 mt-1">
                JPG, PNG, WebP, atau PDF — maksimal 5 MB. Bukti hanya bisa
                dilihat admin.
              </p>
              {bukti && (
                <p className="text-xs text-zinc-700 mt-1">
                  Dipilih: <strong>{bukti.name}</strong> (
                  {(bukti.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || levelsLoading}
              className="w-full px-4 py-3 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Mengirim pendaftaran..." : "Daftar TOAFL Champion"}
            </button>

            <p className="text-xs text-zinc-500 text-center">
              Sudah punya akun?{" "}
              <Link
                href="/login"
                className="font-bold text-yellow-700 hover:text-yellow-800"
              >
                Login di sini
              </Link>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
