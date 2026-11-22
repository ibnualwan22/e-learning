import Link from "next/link";
import { Trophy, LogIn, ArrowLeft, CheckCircle2 } from "lucide-react";

// Halaman sementara Fase 2: formulir pendaftaran Champion + verifikasi
// admin + jadwal hadir di Fase 3. Halaman ini hanya menjelaskan mode-nya.
export default function ChampionPage() {
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

        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <p className="font-bold text-yellow-900">
            Pendaftaran TOAFL Champion segera dibuka.
          </p>
          <p className="text-sm text-yellow-800 mt-1">
            Formulir pendaftaran, verifikasi pembayaran, dan jadwal champion
            sedang disiapkan. Bila sudah punya akun, silakan login terlebih
            dahulu.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold transition"
          >
            <LogIn className="w-4 h-4" />
            Login Peserta
          </Link>
        </div>
      </main>
    </div>
  );
}
