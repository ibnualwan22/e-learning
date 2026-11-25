"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LogOut,
  Clock,
  CheckCircle2,
  PlayCircle,
  Trophy,
  User,
  AtSign,
  Mail,
  MapPin,
  GraduationCap,
} from "lucide-react";

interface ExamItem {
  id: string;
  title: string;
  description: string | null;
  mode: "SIMULASI" | "CHAMPION";
  startTime: string | null;
  endTime: string | null;
  level: { id: string; name: string };
  maharohs: {
    id: string;
    name: string;
    orderIndex: number;
    minutes: number;
    questionCount: number;
    audioRepeats: number;
  }[];
  attempt: { id: string; status: string; finalScore: number | null } | null;
}

interface AttemptItem {
  id: string;
  examId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "TIME_UP";
  startedAt: string | null;
  finishedAt: string | null;
  timeSpentSeconds: number | null;
  rawScore: number | null;
  finalScore: number | null;
  exam: {
    id: string;
    title: string;
    mode: string;
    level: { name: string };
  };
  sections: { maharohId: string; status: string; score: number }[];
}

// TOAFL Fase 4 — portal peserta: daftar ujian yang bisa diikuti (sesuai
// registrasi VERIFIED) + riwayat attempt. Menggantikan portal token
// Olimpiade lama.
export default function ParticipantDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{
    name: string;
    username: string;
    institution?: string | null;
    email?: string | null;
    role: string;
  } | null>(null);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/exam/state");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        setUser(data.user);
        setExams(data.exams || []);
        setAttempts(data.attempts || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function formatDuration(sec: number | null) {
    if (!sec) return "-";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}d`;
  }

  function examScheduleLabel(exam: ExamItem) {
    if (exam.mode !== "CHAMPION") return "Kapan saja";
    const now = new Date();
    if (exam.startTime && now < new Date(exam.startTime)) {
      return `Dibuka ${new Date(exam.startTime).toLocaleString("id-ID")}`;
    }
    if (exam.endTime && now > new Date(exam.endTime)) {
      return "Jadwal sudah lewat";
    }
    if (exam.startTime && exam.endTime) {
      return `${new Date(exam.startTime).toLocaleString("id-ID")} — ${new Date(
        exam.endTime
      ).toLocaleString("id-ID")}`;
    }
    return "Jadwal menyusul";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-zinc-500 text-sm font-medium animate-pulse">
          Memuat portal peserta...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-zinc-900 text-white border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo-markaz-emblem.png"
              alt="Logo Markaz Arabiyah"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 object-contain"
            />
            <div>
              <div className="font-bold text-sm sm:text-base tracking-tight">
                TOAFL CBT
              </div>
              <div className="text-xs text-amber-300">
                Portal Peserta E-learning Markaz Arabiyah
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-white">
                  {user.name}
                </div>
                <div className="text-xs text-amber-300">
                  {user.username} {user.institution ? `• ${user.institution}` : ""}
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-red-900/70 border border-zinc-700 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Kartu Data Diri Peserta */}
        {user && (
          <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="bg-gradient-to-l from-amber-500 to-amber-400 px-6 sm:px-8 py-3.5 flex items-center gap-2">
              <User className="w-4 h-4 text-zinc-950" />
              <h2 className="font-bold text-zinc-950 text-sm">
                Data Diri Peserta
              </h2>
            </div>
            <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-5 items-start">
              <div className="w-16 h-16 shrink-0 rounded-2xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-2xl font-extrabold text-amber-700">
                {user.name.trim().charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 space-y-4 min-w-0">
                <div>
                  <div className="text-xl font-extrabold text-zinc-900">
                    {user.name}
                  </div>
                  <div className="text-xs font-semibold text-amber-700 mt-0.5">
                    Peserta TOAFL Markaz Arabiyah
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2.5 text-zinc-700">
                    <AtSign className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <span className="text-zinc-500 text-xs block">
                        Username
                      </span>
                      <span className="font-mono font-semibold">
                        {user.username}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5 text-zinc-700">
                    <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <span className="text-zinc-500 text-xs block">
                        Asal Instansi
                      </span>
                      <span className="font-semibold">
                        {user.institution || "-"}
                      </span>
                    </span>
                  </div>
                  {user.email && (
                    <div className="flex items-start gap-2.5 text-zinc-700 sm:col-span-2">
                      <Mail className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="text-zinc-500 text-xs block">
                          Email
                        </span>
                        <span className="font-semibold break-all">
                          {user.email}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ujian yang Bisa Diikuti */}
        <div>
          <h2 className="text-lg font-bold text-zinc-900 mb-4">
            Ujian yang Bisa Diikuti
          </h2>

          {exams.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-600 space-y-3">
              <p>
                Belum ada ujian yang bisa diikuti. Daftar dulu sesuai
                mode yang kamu mau:
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/simulasi"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold"
                >
                  <GraduationCap className="w-4 h-4" />
                  Daftar Simulasi (Gratis)
                </Link>
                <Link
                  href="/champion"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold"
                >
                  <Trophy className="w-4 h-4" />
                  Daftar TOAFL Champion
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className="bg-white rounded-xl border border-zinc-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          exam.mode === "SIMULASI"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {exam.mode === "SIMULASI"
                          ? "Simulasi"
                          : "TOAFL Champion"}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {exam.level.name}
                      </span>
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {examScheduleLabel(exam)}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-zinc-900">
                      {exam.title}
                    </h3>
                    {exam.description && (
                      <p className="text-xs text-zinc-600">
                        {exam.description}
                      </p>
                    )}
                    <p className="text-xs text-zinc-500">
                      {exam.maharohs.length} maharoh:{" "}
                      {exam.maharohs
                        .map((m) => `${m.name} (${m.minutes} mnt)`)
                        .join(" • ")}
                    </p>
                    {exam.attempt && exam.attempt.status !== "IN_PROGRESS" && (
                      <p className="text-xs text-zinc-600 flex items-center gap-1">
                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                        Skor terakhir:{" "}
                        <strong>{exam.attempt.finalScore} / 100</strong>
                      </p>
                    )}
                  </div>

                  <div>
                    {exam.attempt?.status === "IN_PROGRESS" ? (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() =>
                            router.push(`/exam/${exam.attempt?.id}/play`)
                          }
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <PlayCircle className="w-4 h-4" />
                          <span>Lanjutkan Mengerjakan</span>
                        </button>
                        <button
                          onClick={() =>
                            router.push(`/ujian-ringan/${exam.attempt?.id}`)
                          }
                          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <span>Versi ringan (koneksi lambat)</span>
                        </button>
                      </div>
                    ) : exam.attempt ? (
                      <button
                        onClick={() =>
                          exam.mode === "SIMULASI"
                            ? router.push(`/exam/${exam.id}/rules`)
                            : router.push(`/hasil/${exam.attempt?.id}`)
                        }
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {exam.mode === "SIMULASI" ? (
                          <>
                            <PlayCircle className="w-4 h-4" />
                            <span>Ulangi Simulasi</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Lihat Hasil</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => router.push(`/exam/${exam.id}/rules`)}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <PlayCircle className="w-4 h-4" />
                        <span>Mulai Ujian</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Riwayat Ujian */}
        {attempts.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-zinc-900 mb-4">
              Riwayat Ujian Anda
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {attempts.map((att) => (
                <div
                  key={att.id}
                  className="bg-white rounded-xl border border-zinc-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          att.status === "IN_PROGRESS"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-zinc-800"
                        }`}
                      >
                        {att.status === "IN_PROGRESS"
                          ? "Sedang Dikerjakan"
                          : att.status === "TIME_UP"
                            ? "Waktu Habis"
                            : "Selesai Dikerjakan"}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {att.exam.mode === "SIMULASI"
                          ? "Simulasi"
                          : "TOAFL Champion"}{" "}
                        • {att.exam.level.name}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-zinc-900">
                      {att.exam.title}
                    </h3>
                    {att.status !== "IN_PROGRESS" && (
                      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-zinc-600">
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                          <Trophy className="w-3.5 h-3.5 text-amber-500" />
                          Skor Akhir: {att.finalScore} / 100
                        </span>
                        <span>
                          Waktu: {formatDuration(att.timeSpentSeconds)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <button
                      onClick={() =>
                        att.status === "IN_PROGRESS"
                          ? router.push(`/exam/${att.id}/play`)
                          : router.push(`/hasil/${att.id}`)
                      }
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      {att.status === "IN_PROGRESS" ? (
                        <>
                          <PlayCircle className="w-4 h-4" />
                          <span>Lanjutkan</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Lihat Hasil</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
