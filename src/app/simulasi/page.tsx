import Link from "next/link";
import { GraduationCap, LogIn, ArrowLeft, CheckCircle2 } from "lucide-react";

// Halaman sementara Fase 2: formulir pendaftaran Simulasi + alur mulai
// ujian hadir di Fase 3. Halaman ini hanya menjelaskan mode-nya.
export default function SimulasiPage() {
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

        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <p className="font-bold text-yellow-900">
            Formulir pendaftaran Simulasi segera dibuka.
          </p>
          <p className="text-sm text-yellow-800 mt-1">
            Pendaftaran, pemilihan level, dan ruang ujian sedang disiapkan.
            Bila sudah punya akun, silakan login terlebih dahulu.
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
