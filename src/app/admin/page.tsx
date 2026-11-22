"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Library,
  ClipboardList,
  Users,
  Activity,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalToaflQuestions: 0,
    totalLevels: 0,
    totalMaharohs: 0,
    totalExams: 0,
    activeExams: 0,
    totalParticipants: 0,
    totalAdmins: 0,
    totalAttempts: 0,
    inProgressAttempts: 0,
    finishedAttempts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/stats");
        if (res.status === 403 || res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (data.stats) setStats(data.stats);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const cards = [
    {
      title: "Bank Soal TOAFL",
      value: stats.totalToaflQuestions,
      sub: `${stats.totalLevels} Level • ${stats.totalMaharohs} Maharoh`,
      href: "/admin/bank-soal",
      icon: Library,
      color: "bg-zinc-100 text-zinc-700",
    },
    {
      title: "Exam TOAFL",
      value: stats.totalExams,
      sub: `${stats.activeExams} Exam Aktif`,
      href: "/admin/exam",
      icon: ClipboardList,
      color: "bg-yellow-100 text-yellow-800",
    },
    {
      title: "Peserta Terdaftar",
      value: stats.totalParticipants,
      sub: `${stats.totalAdmins} Admin`,
      href: "/admin/participants",
      icon: Users,
      color: "bg-zinc-100 text-zinc-700",
    },
    {
      title: "Monitoring Ujian",
      value: stats.inProgressAttempts,
      sub: `${stats.finishedAttempts} Peserta Selesai`,
      href: "/admin/monitoring",
      icon: Activity,
      color: "bg-zinc-100 text-zinc-700",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900">
          Dashboard E-learning Markaz Arabiyah
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Kelola level, maharoh, bank soal TOAFL, exam Simulasi &amp;
          Champion, pantau peserta secara real-time, dan lihat peringkat.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.title}
              href={c.href}
              className="bg-white rounded-xl p-5 border border-zinc-200 shadow-xs hover:border-yellow-400 transition flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${c.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-400" />
              </div>
              <div>
                <div className="text-3xl font-black text-zinc-900">
                  {loading ? "..." : c.value}
                </div>
                <div className="text-sm font-bold text-zinc-700 mt-0.5">
                  {c.title}
                </div>
                <div className="text-xs text-zinc-500 mt-1">{c.sub}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Action Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-zinc-800 font-bold">
            <CheckCircle2 className="w-5 h-5" />
            <h2>Alur Persiapan TOAFL</h2>
          </div>
          <ol className="space-y-3 text-sm text-zinc-600 list-decimal list-inside">
            <li>
              Atur level dan maharoh (menit &amp; pengulangan audio default)
              di menu{" "}
              <Link
                href="/admin/level"
                className="text-yellow-700 font-semibold underline"
              >
                Level TOAFL
              </Link>{" "}
              dan{" "}
              <Link
                href="/admin/maharoh"
                className="text-yellow-700 font-semibold underline"
              >
                Maharoh
              </Link>
              .
            </li>
            <li>
              Isi bank soal per level &times; maharoh (teks/Arab, bobot,
              audio soal &amp; opsi) di menu{" "}
              <Link
                href="/admin/bank-soal"
                className="text-yellow-700 font-semibold underline"
              >
                Bank Soal TOAFL
              </Link>
              .
            </li>
            <li>
              Buat exam Simulasi atau Champion, atur maharoh beserta menit,
              jumlah soal, dan jadwalnya di menu{" "}
              <Link
                href="/admin/exam"
                className="text-yellow-700 font-semibold underline"
              >
                Exam TOAFL
              </Link>
              .
            </li>
            <li>
              Pantau waktu pengerjaan peserta dan lihat papan peringkat di
              menu{" "}
              <Link
                href="/admin/monitoring"
                className="text-yellow-700 font-semibold underline"
              >
                Monitoring &amp; Peringkat
              </Link>
              .
            </li>
          </ol>
        </div>

        <div className="bg-zinc-900 text-white rounded-xl p-6 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-yellow-300">
              <Clock className="w-4 h-4" /> Regulasi TOAFL
            </div>
            <h2 className="text-xl font-bold">
              Ujian Per Maharoh, Timer Per Maharoh
            </h2>
            <p className="text-xs sm:text-sm text-zinc-200/80 leading-relaxed">
              Setiap exam terdiri dari beberapa maharoh berurutan (Istima',
              Qawa'id, Qira'ah). Tiap maharoh punya menit, jumlah soal, dan
              batas putar audio sendiri; maharoh yang sudah selesai terkunci.
              Soal diacak per maharoh dan dibekukan saat maharoh dimulai.
              Simulasi memakai auto-submit saat pelanggaran, Champion hanya
              dicatat untuk monitoring.
            </p>
          </div>

          <div className="pt-4 mt-4 border-t border-zinc-800 flex flex-wrap gap-3">
            <Link
              href="/admin/exam"
              className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold text-xs transition"
            >
              Atur Exam TOAFL
            </Link>
            <Link
              href="/admin/monitoring"
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition"
            >
              Buka Live Monitoring
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
