"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  Clock,
  FileQuestion,
  Volume2,
  Play,
  ArrowLeft,
  CalendarDays,
} from "lucide-react";

interface ExamMaharohInfo {
  id: string;
  name: string;
  orderIndex: number;
  minutes: number;
  questionCount: number;
  audioRepeats: number;
}

interface ExamInfo {
  id: string;
  title: string;
  description: string | null;
  mode: "SIMULASI" | "CHAMPION";
  isActive: boolean;
  startTime: string | null;
  endTime: string | null;
  autoSubmitOnViolation: boolean;
  level: { id: string; name: string };
  maharohs: ExamMaharohInfo[];
}

// TOAFL Fase 4 — halaman Tata Tertib. Folder tetap [sessionId] (warisan
// Olimpiade) tapi param-nya adalah ID Exam TOAFL.
export default function ExamRulesPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId: examId } = use(params);
  const router = useRouter();
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<
    string | null
  >(null);
  const [attemptStatus, setAttemptStatus] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/exam/state?examId=${examId}`);
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) {
          router.push("/exam");
          return;
        }
        const data = await res.json();
        setExam(data.exam);
        setRegistrationStatus(data.registration?.status ?? null);
        setAttemptStatus(data.attempt?.status ?? null);
        if (data.attempt?.status === "IN_PROGRESS") {
          router.replace(`/exam/${examId}/play`);
          return;
        }
        // Champion yang sudah selesai tidak bisa diulang — lihat hasil.
        if (
          data.attempt?.status &&
          data.attempt.status !== "IN_PROGRESS" &&
          data.exam.mode === "CHAMPION"
        ) {
          router.replace(`/exam/${examId}/play`);
          return;
        }
      } catch {
        setError("Gagal memuat tata tertib ujian");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId, router]);

  async function handleStartExam() {
    if (!agreed) return;
    setStarting(true);
    setError("");

    // Fullscreen ala Siakad Usbu (khusus SIMULASI): harus diminta dari
    // gestur klik ini. iPhone Safari tidak menyediakan API-nya — gagal
    // diam-diam, ujian tetap jalan; halaman play menawarkan masuk lagi.
    if (exam?.mode === "SIMULASI") {
      const el = document.documentElement as unknown as {
        requestFullscreen?: () => Promise<void>;
      };
      if (el.requestFullscreen) {
        try {
          await el.requestFullscreen();
        } catch {
          // Lanjut tanpa fullscreen.
        }
      }
    }

    try {
      const res = await fetch("/api/exam/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal memulai ujian");
        setStarting(false);
        return;
      }

      router.push(`/exam/${examId}/play`);
    } catch {
      setError("Gagal menghubungi server");
      setStarting(false);
    }
  }

  if (loading || !exam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-sm text-zinc-500 animate-pulse">
          Memuat halaman Tata Tertib...
        </div>
      </div>
    );
  }

  const totalQuestions = exam.maharohs.reduce(
    (sum, m) => sum + m.questionCount,
    0
  );
  const totalMinutes = exam.maharohs.reduce((sum, m) => sum + m.minutes, 0);
  const notVerified = registrationStatus !== "VERIFIED";

  return (
    <div className="min-h-screen bg-zinc-100 py-8 px-4 sm:px-6 flex items-center justify-center">
      <div className="max-w-3xl w-full bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-6 sm:p-8 border-b border-zinc-800">
          <button
            onClick={() => router.push("/exam")}
            className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-white mb-4 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Portal Peserta
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold">
            {exam.title}
          </h1>
          {exam.description && (
            <p className="text-sm text-zinc-200/80 mt-2">{exam.description}</p>
          )}
          <p className="text-xs text-amber-300 mt-2">
            {exam.mode === "SIMULASI" ? "Simulasi TOAFL" : "TOAFL Champion"} •{" "}
            {exam.level.name}
          </p>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-6 bg-zinc-50 border-b border-zinc-200">
          <div className="bg-white p-4 rounded-xl border border-zinc-200 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-100 text-zinc-800">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-zinc-500">Total Waktu</div>
              <div className="text-sm font-bold text-zinc-900">
                {totalMinutes} Menit
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-zinc-200 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-zinc-100 text-zinc-700">
              <FileQuestion className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-zinc-500">Jumlah Soal</div>
              <div className="text-sm font-bold text-zinc-900">
                {totalQuestions} Pilihan Ganda
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-zinc-200 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-100 text-amber-800">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-zinc-500">Maharoh</div>
              <div className="text-sm font-bold text-zinc-900">
                {exam.maharohs.length} Bagian
              </div>
            </div>
          </div>
        </div>

        {/* Daftar maharoh */}
        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="font-bold text-sm text-zinc-900 mb-3">
              Susunan Maharoh (dikerjakan berurutan)
            </h2>
            <div className="space-y-2">
              {exam.maharohs.map((m, idx) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-sm"
                >
                  <span className="font-bold text-zinc-900">
                    {idx + 1}. {m.name}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {m.minutes} menit • {m.questionCount} soal
                    {m.audioRepeats > 0
                      ? ` • audio maks ${m.audioRepeats}x`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {exam.mode === "CHAMPION" && (exam.startTime || exam.endTime) && (
            <div className="flex items-start gap-2 text-sm text-zinc-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <CalendarDays className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Jadwal champion:{" "}
                <strong>
                  {exam.startTime
                    ? new Date(exam.startTime).toLocaleString("id-ID")
                    : "—"}
                </strong>
                {" — "}
                <strong>
                  {exam.endTime
                    ? new Date(exam.endTime).toLocaleString("id-ID")
                    : "—"}
                </strong>
              </span>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 text-amber-800 font-bold text-base mb-3">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              <span>Tata Tertib &amp; Ketentuan</span>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-5 text-sm text-zinc-800 leading-relaxed space-y-2">
              <p>
                1. Ujian dikerjakan per maharoh secara berurutan. Tiap
                maharoh punya waktunya sendiri; waktu berjalan sejak maharoh
                dimulai dan tidak dapat dijeda.
              </p>
              <p>
                2. Maharoh yang sudah dikumpulkan TERKUNCI — tidak bisa
                kembali dan jawabannya tidak bisa diubah.
              </p>
              <p>
                3. Soal diacak per maharoh dan urutan jawaban diacak per
                peserta. Jawaban tersimpan otomatis setiap kali dipilih.
              </p>
              <p>
                4. Audio (bila ada) diputar dari awal dan tidak bisa di-skip
                atau diulang dari tengah. Jumlah pengulangan dibatasi per
                maharoh sesuai ketentuan di atas.
              </p>
              <p>
                5. Semua soal pilihan ganda; skor dihitung dari bobot soal
                yang dijawab benar. Skor per maharoh dan total tampil setelah
                semua maharoh selesai.
              </p>
              {exam.mode === "SIMULASI" && exam.autoSubmitOnViolation && (
                <p>
                  6. Mode simulasi: bila terdeteksi pelanggaran (pindah tab /
                  aplikasi mengambang), maharoh yang sedang berjalan akan
                  di-submit otomatis.
                </p>
              )}
            </div>
          </div>

          {notVerified && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              Pendaftaranmu untuk {exam.mode === "SIMULASI" ? "simulasi" : "champion"} level{" "}
              {exam.level.name} belum terverifikasi
              {registrationStatus ? ` (status: ${registrationStatus})` : ""}.
              Selesaikan pendaftaran dulu sebelum memulai ujian.
            </div>
          )}

          {attemptStatus && exam.mode === "SIMULASI" && (
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-700 text-sm">
              Kamu sudah pernah mengikuti simulasi ini. Memulai lagi akan
              membuat attempt baru (simulasi boleh diulang).
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Checkbox Persetujuan */}
          <label className="flex items-start gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 accent-zinc-700 rounded cursor-pointer"
            />
            <div className="text-xs sm:text-sm text-zinc-700">
              <span className="font-bold text-zinc-900 block mb-0.5">
                Saya telah membaca dan menyetujui seluruh Tata Tertib di atas.
              </span>
              Saya memahami bahwa begitu tombol{" "}
              <strong>&ldquo;Mulai Kerjakan Sekarang&rdquo;</strong> ditekan,
              maharoh pertama langsung dimulai dan waktunya berjalan.
            </div>
          </label>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={!agreed || starting || notVerified}
              onClick={handleStartExam}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-zinc-700/25 transition cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {starting ? "Memulai Waktu Ujian..." : "Mulai Kerjakan Sekarang"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
