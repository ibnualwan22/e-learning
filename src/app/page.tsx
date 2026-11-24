import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  BookMarked,
  Timer,
  Trophy,
  ArrowRight,
  CheckCircle2,
  LogIn,
  Users,
  UserPlus,
  CalendarDays,
  Banknote,
  Headphones,
  BookOpen,
  PenLine,
  GraduationCap,
  RotateCcw,
} from "lucide-react";

// Halaman ini membaca cookie sesi lalu redirect, jadi tidak bisa di-prerender.
// Panduan resmi Next.js (cache-components): tandai segmen ini boleh blocking.
export const instant = false;

const MAHAROH_FALLBACK = [
  {
    name: "Istima'",
    description: "Mendengarkan",
    defaultMinutes: 50,
    defaultAudioRepeats: 2,
  },
  {
    name: "Qawa'id",
    description: "Tata bahasa Arab",
    defaultMinutes: 40,
    defaultAudioRepeats: 2,
  },
  {
    name: "Qira'ah",
    description: "Membaca",
    defaultMinutes: 50,
    defaultAudioRepeats: 2,
  },
];

const STEPS = [
  {
    no: "01",
    title: "Daftar & Pilih Level",
    desc: "Buat akun, lengkapi identitas, lalu pilih level ujianmu (Mubtadi', Mutawassith, atau Mutaqaddim).",
  },
  {
    no: "02",
    title: "Verifikasi & Mulai",
    desc: "Simulasi langsung bisa dimulai kapan saja. TOAFL Champion diverifikasi admin dulu dan dikerjakan sesuai jadwal.",
  },
  {
    no: "03",
    title: "Kerjakan Per Maharoh",
    desc: "Soal dikerjakan per maharoh berurutan, tiap maharoh ada waktunya sendiri. Maharoh yang sudah selesai terkunci.",
  },
];

const SCORING = [
  {
    icon: BookMarked,
    metric: "Per Maharoh",
    title: "Skor Per Maharoh + Total",
    desc: "Nilai dihitung otomatis dari bobot tiap soal, ditampilkan per maharoh beserta totalnya.",
  },
  {
    icon: RotateCcw,
    metric: "Simulasi",
    title: "Pembahasan Langsung",
    desc: "Mode Simulasi menampilkan skor dan pembahasan (kunci + penjelasan) begitu selesai.",
  },
  {
    icon: Trophy,
    metric: "Champion",
    title: "Leaderboard & Sertifikat",
    desc: "TOAFL Champion memakai leaderboard per level; sertifikat terbit setelah pengumuman resmi.",
  },
];

export default async function HomePage() {
  const session = await getSession();
  if (session) {
    if (session.role === "ADMIN") {
      redirect("/admin");
    }
    redirect("/exam");
  }

  // Jumlah peserta = akun PARTICIPANT di database. Bila database tidak
  // terjangkau, strip statistik disembunyikan.
  let totalParticipants: number | null = null;
  let maharohs: {
    name: string;
    description: string | null;
    defaultMinutes: number;
    defaultAudioRepeats: number;
  }[] = MAHAROH_FALLBACK;
  let levels: { name: string }[] = [];
  try {
    totalParticipants = await prisma.user.count({
      where: { role: "PARTICIPANT" },
    });
    const dbMaharohs = await prisma.maharoh.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: {
        name: true,
        description: true,
        defaultMinutes: true,
        defaultAudioRepeats: true,
      },
    });
    if (dbMaharohs.length > 0) maharohs = dbMaharohs;
    levels = await prisma.level.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: { name: true },
    });
  } catch {
    totalParticipants = null;
  }

  return (
    <div className="font-design-system min-h-screen bg-[var(--color-surface-base)] text-[var(--color-text-tertiary)] flex flex-col selection:bg-[var(--color-surface-strong)] selection:text-[var(--color-surface-base)]">
      {/* Skip Link untuk aksesibilitas keyboard (WCAG 2.2 AA) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-[var(--space-1)] focus:py-3 focus:rounded-md focus:bg-[var(--color-surface-strong)] focus:text-[var(--color-surface-base)] focus:font-bold focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-text-tertiary)]"
      >
        Lewati ke konten utama
      </a>

      {/* Primary Navigation */}
      <header className="sticky top-0 z-40 bg-[var(--color-surface-base)]/95 backdrop-blur border-b border-[var(--color-border-muted)]">
        <div className="max-w-6xl mx-auto px-[var(--space-1)] min-h-[76px] flex items-center justify-between gap-[var(--space-1)]">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-surface-strong)] transition duration-[200ms]"
          >
            <span className="h-9 sm:h-11 w-9 sm:w-11 shrink-0 rounded-md bg-[var(--color-surface-strong)] text-[var(--color-surface-base)] flex items-center justify-center font-black text-xl">
              T
            </span>
            <span className="min-w-0">
              <span className="block font-extrabold tracking-tight text-[var(--color-text-tertiary)] text-base sm:text-lg leading-tight">
                E-LEARNING MARKAZ ARABIYAH
              </span>
              <span className="block text-xs sm:text-base text-[var(--color-text-secondary)] leading-tight">
                Ujian TOAFL (CBT)
              </span>
            </span>
          </Link>

          <nav
            aria-label="Navigasi Utama"
            className="hidden md:flex items-center gap-[var(--space-2)] text-base font-medium"
          >
            <a
              href="#mode"
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-tertiary)] active:text-[var(--color-surface-strong)] rounded-sm py-1 transition duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-surface-strong)]"
            >
              Mode Ujian
            </a>
            <a
              href="#maharoh"
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-tertiary)] active:text-[var(--color-surface-strong)] rounded-sm py-1 transition duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-surface-strong)]"
            >
              Maharoh
            </a>
            <a
              href="#alur"
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-tertiary)] active:text-[var(--color-surface-strong)] rounded-sm py-1 transition duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-surface-strong)]"
            >
              Alur Pelaksanaan
            </a>
            <a
              href="#penilaian"
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-tertiary)] active:text-[var(--color-surface-strong)] rounded-sm py-1 transition duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-surface-strong)]"
            >
              Sistem Penilaian
            </a>
          </nav>

          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-3 py-2 sm:px-[var(--space-1)] sm:py-2.5 rounded-md bg-[var(--color-surface-strong)] hover:bg-[var(--color-surface-strong-hover)] active:bg-[var(--color-surface-strong-active)] text-[var(--color-surface-base)] font-bold text-sm sm:text-base transition duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-tertiary)]"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            <span>Login Peserta</span>
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {/* Hero Section */}
        <section
          aria-labelledby="hero-heading"
          className="relative overflow-hidden border-b border-[var(--color-border-muted)] bg-zinc-950"
        >
          <div className="relative max-w-6xl mx-auto px-[var(--space-1)] py-[var(--space-2)] lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-[var(--space-2)] items-center">
              <div className="lg:col-span-7">
                <h1
                  id="hero-heading"
                  className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight mt-3"
                >
                  TOAFL{" "}
                  <span className="text-yellow-400">
                    Markaz Arabiyah
                  </span>
                </h1>

                <p className="text-base font-bold text-yellow-400 mt-3">
                  Test of Arabic as a Foreign Language &bull; Ujian Bahasa
                  Arab Berbasis Komputer (CBT)
                </p>

                <p className="text-base sm:text-lg text-zinc-300 leading-relaxed max-w-2xl mt-[var(--space-1)]">
                  Uji kemampuan bahasa Arabmu per maharoh —{" "}
                  <strong className="text-white font-semibold">
                    Istima', Qawa'id, dan Qira'ah
                  </strong>{" "}
                  — dengan soal pilihan ganda, timer per maharoh, dan
                  penilaian otomatis. Tersedia dua mode:{" "}
                  <strong className="text-white font-semibold">
                    Simulasi
                  </strong>{" "}
                  untuk latihan kapan saja, dan{" "}
                  <strong className="text-white font-semibold">
                    TOAFL Champion
                  </strong>{" "}
                  sebagai ajang kompetisi.
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center gap-[var(--space-1)] mt-[var(--space-2)]">
                  <Link
                    href="/simulasi"
                    className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-md bg-[var(--color-surface-strong)] hover:bg-[var(--color-surface-strong-hover)] active:bg-[var(--color-surface-strong-active)] text-[var(--color-surface-base)] font-extrabold text-base tracking-wide shadow-lg transition duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-text-tertiary)]"
                  >
                    <GraduationCap className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span>Daftar Simulasi (Gratis)</span>
                    <ArrowRight
                      className="w-5 h-5 shrink-0"
                      aria-hidden="true"
                    />
                  </Link>

                  {/* Tombol Champion disembunyikan sementara (simulasi 25 Nov) — hapus 'hidden' untuk menampilkan lagi. */}
                  <Link
                    href="/champion"
                    className="hidden inline-flex items-center justify-center gap-2 px-6 py-4 rounded-md bg-white/10 hover:bg-white/20 active:bg-white/10 border border-white/20 text-white font-semibold text-base transition duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-surface-strong)]"
                  >
                    <Trophy className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span>Ikut TOAFL Champion</span>
                  </Link>
                </div>

                <div className="mt-[var(--space-2)] pt-[var(--space-1)] border-t border-white/10 grid grid-cols-3 gap-[var(--space-1)]">
                  <div>
                    <div className="text-lg font-extrabold text-white">
                      {maharohs.length} Maharoh
                    </div>
                    <div className="text-base text-zinc-400">
                      Per Ujian
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-extrabold text-white">
                      {levels.length > 0 ? `${levels.length} Level` : "3 Level"}
                    </div>
                    <div className="text-base text-zinc-400">
                      Pilih Saat Daftar
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-extrabold text-white">
                      100% Server
                    </div>
                    <div className="text-base text-zinc-400">
                      Sinkronisasi Waktu
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Panel Akses */}
              <div className="lg:col-span-5">
                <div className="rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-[var(--space-1)] sm:p-[var(--space-2)]">
                  <div className="flex items-center justify-between pb-[var(--space-1)] border-b border-[var(--color-border-muted)]">
                    <div>
                      <span className="text-base font-bold uppercase tracking-wider text-[var(--color-surface-strong)] block">
                        Akses Ruang Ujian
                      </span>
                      <h2 className="text-xl font-extrabold text-[var(--color-text-tertiary)] mt-1">
                        Kesiapan Peserta
                      </h2>
                    </div>
                    <span className="px-3 py-1 rounded-md bg-[var(--color-surface-base)] border border-[var(--color-surface-strong)] text-[var(--color-surface-strong)] font-bold text-base">
                      Aktif
                    </span>
                  </div>

                  <ul className="space-y-4 my-[var(--space-1)]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2
                        className="w-5 h-5 text-[var(--color-surface-strong)] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <div className="font-bold text-[var(--color-text-tertiary)] text-base">
                          Akun Peserta Terdaftar
                        </div>
                        <p className="text-base text-[var(--color-text-secondary)]">
                          Daftar dengan username dan kata sandi, lalu pilih
                          level ujianmu.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Timer
                        className="w-5 h-5 text-[var(--color-surface-strong)] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <div className="font-bold text-[var(--color-text-tertiary)] text-base">
                          Timer Per Maharoh
                        </div>
                        <p className="text-base text-[var(--color-text-secondary)]">
                          Tiap maharoh punya waktunya sendiri; maharoh yang
                          sudah selesai terkunci dan tidak bisa kembali.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Headphones
                        className="w-5 h-5 text-[var(--color-surface-strong)] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <div className="font-bold text-[var(--color-text-tertiary)] text-base">
                          Audio Istima' Tanpa Seek
                        </div>
                        <p className="text-base text-[var(--color-text-secondary)]">
                          Audio diputar dari awal dengan batas pengulangan yang
                          dihitung server.
                        </p>
                      </div>
                    </li>
                  </ul>

                  <div className="pt-[var(--space-1)] border-t border-[var(--color-border-muted)]">
                    <Link
                      href="/login"
                      className="w-full inline-flex items-center justify-center gap-2 px-[var(--space-1)] py-3.5 rounded-md bg-[var(--color-surface-strong)] hover:bg-[var(--color-surface-strong-hover)] active:bg-[var(--color-surface-strong-active)] text-[var(--color-surface-base)] font-extrabold text-base transition duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-tertiary)]"
                    >
                      <LogIn className="w-5 h-5" aria-hidden="true" />
                      <span>Login Peserta Sekarang</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Statistik Peserta */}
        {totalParticipants !== null && (
          <section
            aria-labelledby="statistik-heading"
            className="bg-[var(--color-surface-raised)] border-b border-[var(--color-border-muted)]"
          >
            <div className="max-w-6xl mx-auto px-[var(--space-1)] py-[var(--space-2)]">
              <h2 id="statistik-heading" className="sr-only">
                Statistik Peserta
              </h2>
              <div className="rounded-md bg-[var(--color-surface-base)] border border-[var(--color-border-muted)] p-[var(--space-1)] flex items-center gap-4 max-w-xl">
                <span className="w-11 h-11 rounded-md bg-[var(--color-surface-strong)] text-[var(--color-surface-base)] flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" aria-hidden="true" />
                </span>
                <div>
                  <div className="text-4xl font-extrabold text-[var(--color-text-tertiary)]">
                    {totalParticipants.toLocaleString("id-ID")}
                  </div>
                  <div className="text-base text-[var(--color-text-secondary)]">
                    Jumlah Peserta Terdaftar
                  </div>
                </div>
              </div>
              <p className="text-base text-[var(--color-text-secondary)] mt-[var(--space-1)]">
                Data diperbarui otomatis dari sistem.
              </p>
            </div>
          </section>
        )}

        {/* Dua Mode Ujian */}
        <section
          id="mode"
          aria-labelledby="mode-heading"
          className="bg-[var(--color-surface-base)] border-b border-[var(--color-border-muted)]"
        >
          <div className="max-w-6xl mx-auto px-[var(--space-1)] py-[var(--space-2)] lg:py-16">
            <div className="max-w-2xl">
              <p className="text-base font-bold uppercase tracking-widest text-[var(--color-surface-strong)]">
                Dua Mode Ujian
              </p>
              <h2
                id="mode-heading"
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--color-text-tertiary)] mt-2"
              >
                Satu Situs, Dua Cara Mengikuti TOAFL
              </h2>
              <p className="text-base text-[var(--color-text-secondary)] mt-2">
                Mesin ujiannya sama; bedanya hanya jalur pendaftaran, jadwal,
                dan perlakuan pelanggaran.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-1)] mt-[var(--space-2)]">
              <article className="rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border-muted)] hover:border-[var(--color-surface-strong)] p-[var(--space-1)] sm:p-[var(--space-2)] transition duration-[200ms]">
                <span className="inline-flex items-center gap-2 text-base font-bold text-[var(--color-surface-strong)]">
                  <GraduationCap className="w-5 h-5" aria-hidden="true" />
                  Simulasi
                </span>
                <h3 className="text-xl font-bold text-[var(--color-text-tertiary)] mt-2">
                  Latihan Untuk Satu Sekolah
                </h3>
                <ul className="text-base text-[var(--color-text-secondary)] leading-relaxed mt-2 space-y-1.5 list-none">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-5 h-5 text-[var(--color-surface-strong)] shrink-0" aria-hidden="true" />
                    Gratis — daftar langsung terverifikasi otomatis
                  </li>
                  <li className="flex gap-2">
                    <CalendarDays className="w-5 h-5 text-[var(--color-surface-strong)] shrink-0" aria-hidden="true" />
                    Kapan saja, boleh diulang
                  </li>
                  <li className="flex gap-2">
                    <RotateCcw className="w-5 h-5 text-[var(--color-surface-strong)] shrink-0" aria-hidden="true" />
                    Skor + pembahasan langsung setelah selesai
                  </li>
                </ul>
                <Link
                  href="/simulasi"
                  className="mt-[var(--space-1)] inline-flex items-center justify-center gap-2 px-[var(--space-1)] py-2.5 rounded-md bg-[var(--color-surface-strong)] hover:bg-[var(--color-surface-strong-hover)] text-[var(--color-surface-base)] font-bold text-base transition duration-[200ms]"
                >
                  Daftar Simulasi
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </article>

              {/* Kartu Champion disembunyikan sementara (simulasi 25 Nov) — hapus 'hidden' untuk menampilkan lagi. */}
              <article className="hidden rounded-md bg-zinc-950 text-white border border-zinc-800 p-[var(--space-1)] sm:p-[var(--space-2)]">
                <span className="inline-flex items-center gap-2 text-base font-bold text-yellow-400">
                  <Trophy className="w-5 h-5" aria-hidden="true" />
                  TOAFL Champion
                </span>
                <h3 className="text-xl font-bold mt-2">
                  Kompetisi Terbuka
                </h3>
                <ul className="text-base text-zinc-300 leading-relaxed mt-2 space-y-1.5 list-none">
                  <li className="flex gap-2">
                    <Banknote className="w-5 h-5 text-yellow-400 shrink-0" aria-hidden="true" />
                    Berbayar — daftar dengan bukti pembayaran, diverifikasi admin
                  </li>
                  <li className="flex gap-2">
                    <CalendarDays className="w-5 h-5 text-yellow-400 shrink-0" aria-hidden="true" />
                    Jadwal tetap, satu kali percobaan
                  </li>
                  <li className="flex gap-2">
                    <Trophy className="w-5 h-5 text-yellow-400 shrink-0" aria-hidden="true" />
                    Leaderboard per level + sertifikat setelah pengumuman resmi
                  </li>
                </ul>
                <Link
                  href="/champion"
                  className="mt-[var(--space-1)] inline-flex items-center justify-center gap-2 px-[var(--space-1)] py-2.5 rounded-md bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold text-base transition duration-[200ms]"
                >
                  Ikut TOAFL Champion
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </article>
            </div>
          </div>
        </section>

        {/* Maharoh */}
        <section
          id="maharoh"
          aria-labelledby="maharoh-heading"
          className="bg-[var(--color-surface-raised)] border-b border-[var(--color-border-muted)]"
        >
          <div className="max-w-6xl mx-auto px-[var(--space-1)] py-[var(--space-2)] lg:py-16">
            <div className="max-w-2xl">
              <p className="text-base font-bold uppercase tracking-widest text-[var(--color-surface-strong)]">
                Maharoh Ujian
              </p>
              <h2
                id="maharoh-heading"
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--color-text-tertiary)] mt-2"
              >
                Tiga Maharoh, Satu Ujian
              </h2>
              <p className="text-base text-[var(--color-text-secondary)] mt-2">
                Dikerjakan berurutan dalam satu ujian. Tiap maharoh punya
                menit dan jumlah soal sendiri yang diatur admin.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--space-1)] mt-[var(--space-2)]">
              {maharohs.map((m, i) => {
                const Icon =
                  m.name.toLowerCase().includes("istima")
                    ? Headphones
                    : m.name.toLowerCase().includes("qira")
                      ? BookOpen
                      : PenLine;
                return (
                  <article
                    key={m.name}
                    className="rounded-md bg-[var(--color-surface-base)] border border-[var(--color-border-muted)] hover:border-[var(--color-surface-strong)] p-[var(--space-1)] transition duration-[200ms]"
                  >
                    <span className="inline-flex items-center justify-center w-11 h-11 rounded-md bg-[var(--color-surface-strong)] text-[var(--color-surface-base)]">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <h3 className="text-xl font-bold text-[var(--color-text-tertiary)] mt-3">
                      {i + 1}. {m.name}
                    </h3>
                    <p className="text-base text-[var(--color-text-secondary)] leading-relaxed mt-1">
                      {m.description || "Maharoh ujian TOAFL"}
                    </p>
                    <p className="text-sm font-bold text-[var(--color-surface-strong)] mt-2">
                      {m.defaultMinutes} menit &bull; Audio maks.{" "}
                      {m.defaultAudioRepeats}&times; putar
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Alur Mengikuti Ujian */}
        <section
          id="alur"
          aria-labelledby="alur-heading"
          className="bg-[var(--color-surface-base)] border-b border-[var(--color-border-muted)]"
        >
          <div className="max-w-6xl mx-auto px-[var(--space-1)] py-[var(--space-2)] lg:py-16">
            <div className="max-w-2xl">
              <p className="text-base font-bold uppercase tracking-widest text-[var(--color-surface-strong)]">
                Alur Pelaksanaan
              </p>
              <h2
                id="alur-heading"
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--color-text-tertiary)] mt-2"
              >
                Tiga Tahap Menuju Ruang Ujian
              </h2>
              <p className="text-base text-[var(--color-text-secondary)] mt-2">
                Prosedur terstruktur bagi seluruh peserta agar pelaksanaan ujian
                berjalan tertib dan objektif.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-1)] mt-[var(--space-2)]">
              {STEPS.map((s) => (
                <div
                  key={s.no}
                  className="rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] p-[var(--space-1)]"
                >
                  <div className="inline-flex items-center justify-center px-3 py-1 rounded-md bg-[var(--color-surface-strong)] text-[var(--color-surface-base)] font-extrabold text-base">
                    Tahap {s.no}
                  </div>
                  <h3 className="text-xl font-bold text-[var(--color-text-tertiary)] mt-[var(--space-1)]">
                    {s.title}
                  </h3>
                  <p className="text-base text-[var(--color-text-secondary)] leading-relaxed mt-2">
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-[var(--space-2)] p-[var(--space-1)] rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border-muted)] flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-1)]">
              <p className="text-base text-[var(--color-text-secondary)] flex items-start sm:items-center gap-3">
                <UserPlus
                  className="w-5 h-5 text-[var(--color-surface-strong)] shrink-0 mt-0.5 sm:mt-0"
                  aria-hidden="true"
                />
                <span>
                  Satu orang satu akun — username, email, dan nomor WA harus
                  unik.
                </span>
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-[var(--space-1)] py-2.5 rounded-md bg-[var(--color-surface-strong)] hover:bg-[var(--color-surface-strong-hover)] active:bg-[var(--color-surface-strong-active)] text-[var(--color-surface-base)] font-bold text-base shrink-0 transition duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-tertiary)]"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>Login Peserta</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Sistem Penilaian */}
        <section
          id="penilaian"
          aria-labelledby="penilaian-heading"
          className="bg-[var(--color-surface-raised)] border-b border-[var(--color-border-muted)]"
        >
          <div className="max-w-6xl mx-auto px-[var(--space-1)] py-[var(--space-2)] lg:py-16">
            <div className="max-w-2xl">
              <p className="text-base font-bold uppercase tracking-widest text-[var(--color-surface-strong)]">
                Metodologi Evaluasi
              </p>
              <h2
                id="penilaian-heading"
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--color-text-tertiary)] mt-2"
              >
                Sistem Penilaian Transparan &amp; Otomatis
              </h2>
              <p className="text-base text-[var(--color-text-secondary)] mt-2">
                Semua soal pilihan ganda, dinilai otomatis berdasarkan bobot
                tiap soal. Soal diacak per maharoh dan dibekukan saat maharoh
                dimulai.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-1)] mt-[var(--space-2)]">
              {SCORING.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.title}
                    className="rounded-md bg-[var(--color-surface-base)] border border-[var(--color-border-muted)] p-[var(--space-1)]"
                  >
                    <span className="inline-flex items-center justify-center w-11 h-11 rounded-md bg-[var(--color-surface-strong)] text-[var(--color-surface-base)]">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <div className="text-base font-bold text-[var(--color-surface-strong)] mt-3">
                      {s.metric}
                    </div>
                    <h3 className="text-xl font-bold text-[var(--color-text-tertiary)] mt-1">
                      {s.title}
                    </h3>
                    <p className="text-base text-[var(--color-text-secondary)] leading-relaxed mt-2">
                      {s.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA Penutup */}
        <section
          aria-labelledby="cta-heading"
          className="bg-zinc-950"
        >
          <div className="max-w-6xl mx-auto px-[var(--space-1)] py-[var(--space-2)] lg:py-16 text-center">
            <h2
              id="cta-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white"
            >
              Siap Menguji Bahasa Arabmu?
            </h2>
            <p className="text-base text-zinc-300 mt-2 max-w-2xl mx-auto">
              Mulai dari Simulasi untuk latihan, atau langsung tantang dirimu
              di TOAFL Champion.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-[var(--space-1)] mt-[var(--space-2)]">
              <Link
                href="/simulasi"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-md bg-[var(--color-surface-strong)] hover:bg-[var(--color-surface-strong-hover)] text-[var(--color-surface-base)] font-extrabold text-base transition duration-[200ms]"
              >
                <GraduationCap className="w-5 h-5" aria-hidden="true" />
                <span>Daftar Simulasi</span>
              </Link>
              {/* Tombol Champion disembunyikan sementara (simulasi 25 Nov) — hapus 'hidden' untuk menampilkan lagi. */}
              <Link
                href="/champion"
                className="hidden inline-flex items-center justify-center gap-2 px-6 py-4 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-base transition duration-[200ms]"
              >
                <Trophy className="w-5 h-5" aria-hidden="true" />
                <span>Ikut TOAFL Champion</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[var(--color-surface-base)] border-t border-[var(--color-border-muted)]">
        <div className="max-w-6xl mx-auto px-[var(--space-1)] py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
          <span>
            &copy; 2026 E-learning Markaz Arabiyah &mdash; Ujian TOAFL
            (Simulasi &amp; Champion)
          </span>
          <Link href="/login" className="font-semibold hover:text-[var(--color-text-tertiary)]">
            Login Admin / Peserta
          </Link>
        </div>
      </footer>
    </div>
  );
}
