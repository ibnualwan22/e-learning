"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  LogIn,
  ArrowLeft,
  CheckCircle2,
  UserPlus,
  PlayCircle,
  Clock,
} from "lucide-react";

interface LevelOption {
  id: string;
  name: string;
  description: string | null;
}

interface MyExam {
  id: string;
  title: string;
  description: string | null;
  mode: "SIMULASI" | "CHAMPION";
  level: { id: string; name: string };
  maharohs: {
    id: string;
    name: string;
    minutes: number;
    questionCount: number;
  }[];
  attempt: { id: string; status: string; finalScore: number | null } | null;
}

// TOAFL Fase 3 — halaman pendaftaran Simulasi: form identitas + langsung
// terverifikasi otomatis (gratis, tanpa bukti bayar). Sesudah berhasil,
// akun langsung login (cookie diset server) — peserta bisa masuk portal.
export default function SimulasiPage() {
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

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successUsername, setSuccessUsername] = useState("");

  // TOAFL Fase 4 — bila sudah login, tampilkan ujian simulasi yang bisa
  // diikuti (sesuai registrasi VERIFIED) + tombol mulai.
  const [myExams, setMyExams] = useState<MyExam[]>([]);

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

  useEffect(() => {
    async function loadMyExams() {
      try {
        const res = await fetch("/api/exam/state");
        if (!res.ok) return;
        const data = await res.json();
        setMyExams(
          (data.exams || []).filter((e: MyExam) => e.mode === "SIMULASI")
        );
      } catch {
        // belum login: abaikan, form pendaftaran tetap tampil
      }
    }
    loadMyExams();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/pendaftaran/simulasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          confirmPassword,
          name,
          institution,
          email,
          whatsapp,
          levelId,
        }),
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
            <img
              src="/logo-markaz-emblem.png"
              alt="Logo Markaz Arabiyah"
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 object-contain"
            />
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
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-bold">
          <GraduationCap className="w-4 h-4" />
          Simulasi TOAFL
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-4">
          Latihan TOAFL Untuk Satu Sekolah
        </h1>
        <p className="text-zinc-600 leading-relaxed mt-3">
          Simulasi adalah mode latihan: gratis, bisa dikerjakan kapan saja,
          dan boleh diulang. Skor per maharoh beserta pembahasan (kunci +
          penjelasan) tampil langsung setelah selesai.
        </p>

        <ul className="mt-6 space-y-2.5 text-zinc-700">
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            Gratis — daftar langsung terverifikasi otomatis, tanpa bukti bayar
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            Kapan saja, boleh diulang tanpa batas
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            Soal diacak per maharoh; timer per maharoh; maharoh selesai
            terkunci
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            Auto-submit maharoh berjalan bila terdeteksi pelanggaran (pindah
            tab / aplikasi mengambang)
          </li>
        </ul>

        {myExams.length > 0 && (
          <div className="mt-8 space-y-3">
            <h2 className="text-lg font-bold">Ujian Simulasi Saya</h2>
            {myExams.map((exam) => (
              <div
                key={exam.id}
                className="bg-white border border-zinc-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-800">
                      Simulasi
                    </span>
                    <span className="text-xs text-zinc-500">
                      {exam.level.name}
                    </span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Kapan saja
                    </span>
                  </div>
                  <h3 className="font-bold text-zinc-900 mt-1.5">
                    {exam.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {exam.maharohs.length} maharoh:{" "}
                    {exam.maharohs
                      .map((m) => `${m.name} (${m.minutes} mnt)`)
                      .join(" • ")}
                  </p>
                  {exam.attempt &&
                    exam.attempt.status !== "IN_PROGRESS" && (
                      <p className="text-xs text-zinc-600 mt-1">
                        Skor terakhir:{" "}
                        <strong>{exam.attempt.finalScore}</strong>
                      </p>
                    )}
                </div>
                <Link
                  href={
                    exam.attempt?.status === "IN_PROGRESS"
                      ? `/ujian-ringan/${exam.attempt.id}`
                      : exam.attempt
                        ? `/hasil/${exam.attempt.id}`
                        : `/exam/${exam.id}/rules`
                  }
                  className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold"
                >
                  <PlayCircle className="w-4 h-4" />
                  {exam.attempt?.status === "IN_PROGRESS"
                    ? "Lanjutkan Mengerjakan"
                    : exam.attempt
                      ? "Lihat Hasil"
                      : "Mulai Ujian"}
                </Link>
              </div>
            ))}
          </div>
        )}

        {successUsername ? (
          <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-5">
            <p className="font-bold text-green-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Pendaftaran berhasil!
            </p>
            <p className="text-sm text-green-800 mt-1">
              Akun <strong>@{successUsername}</strong> langsung terverifikasi
              dan sudah login. Silakan masuk ke portal peserta untuk melihat
              ujian simulasi yang tersedia.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold transition"
            >
              <LogIn className="w-4 h-4" />
              Masuk ke Portal Peserta
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-8 bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-4"
          >
            <h2 className="text-lg font-bold flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-yellow-600" />
              Daftar Simulasi
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
                {error}
              </div>
            )}

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

            <button
              type="submit"
              disabled={submitting || levelsLoading}
              className="w-full px-4 py-3 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Mendaftar..." : "Daftar Simulasi (Gratis)"}
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
