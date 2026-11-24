"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle2,
  Trophy,
  Award,
  Volume2,
  MinusCircle,
} from "lucide-react";
import { renderRichText } from "@/lib/safeHtml";
import { getTextDirection } from "@/lib/text-direction";

// Predikat hasil — tabel yang sama dengan Siakad (lib/formatters.ts
// getPredikat): >=90 Imtiyaz, >=80 Jayyid Jiddan, >=70 Jayyid,
// di bawah 70 Maqbul. Dihitung dari persentase skor terhadap total bobot.
function getPredikat(persen: number) {
  if (persen >= 90) return { indo: "Imtiyaz", arab: "الامتياز" };
  if (persen >= 80) return { indo: "Jayyid Jiddan", arab: "جيد جدا" };
  if (persen >= 70) return { indo: "Jayyid", arab: "جيد" };
  return { indo: "Maqbul", arab: "مقبول" };
}

interface ReviewOption {
  id: string;
  label: string;
  content: string;
  direction: "RTL" | "LTR";
  contentType: "TEXT" | "AUDIO";
  audioUrl: string | null;
  isCorrect: boolean;
}

interface ReviewQuestion {
  id: string;
  content: string;
  direction: "RTL" | "LTR";
  weight: number;
  audioUrl: string | null;
  explanation: string | null;
  selectedOptionId: string | null;
  options: ReviewOption[];
}

interface ReviewSection {
  id: string;
  maharohId: string;
  maharohName: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "TIME_UP";
  score: number;
  maxScore: number;
  questionCount: number;
  questions: ReviewQuestion[];
}

interface ReviewData {
  attempt: {
    id: string;
    status: string;
    finalScore: number;
    timeSpentSeconds: number | null;
    finishedAt: string | null;
    userName: string;
  };
  exam: {
    id: string;
    title: string;
    mode: "SIMULASI" | "CHAMPION";
    levelName: string;
    certificateReleased: boolean;
  };
  showReview: boolean;
  totalMax: number;
  sections: ReviewSection[];
}

export default function HasilPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/exam/review?attemptId=${attemptId}`);
        const d = await res.json();
        if (!res.ok) {
          setError(d.error || "Gagal memuat hasil");
          return;
        }
        setData(d as ReviewData);
      } catch {
        setError("Gagal menghubungi server");
      } finally {
        setLoading(false);
      }
    })();
  }, [attemptId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-sm font-medium text-zinc-500 animate-pulse">
          Memuat hasil ujian...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 p-8 text-center space-y-4">
          <p className="text-sm font-semibold text-zinc-900">
            {error || "Hasil tidak ditemukan"}
          </p>
          <button
            onClick={() => router.push("/exam")}
            className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold cursor-pointer"
          >
            Kembali ke Portal Peserta
          </button>
        </div>
      </div>
    );
  }

  const totalPercent =
    data.totalMax > 0
      ? Math.round((data.attempt.finalScore / data.totalMax) * 100)
      : null;
  const predikat =
    totalPercent !== null ? getPredikat(totalPercent) : null;
  const mins = data.attempt.timeSpentSeconds
    ? Math.floor(data.attempt.timeSpentSeconds / 60)
    : 0;
  const secs = data.attempt.timeSpentSeconds
    ? data.attempt.timeSpentSeconds % 60
    : 0;

  return (
    <div className="min-h-screen bg-zinc-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Ringkasan */}
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-xs">
          <div className="bg-zinc-900 text-white p-6 sm:p-8 text-center">
            <p className="text-xs text-zinc-300">{data.exam.title}</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {data.exam.mode === "SIMULASI" ? "Simulasi" : "TOAFL Champion"} •{" "}
              {data.exam.levelName} • {data.attempt.userName}
            </p>
            <div className="text-5xl font-black mt-4">
              {data.attempt.finalScore}
              <span className="text-xl font-bold text-zinc-400">
                {" "}
                / {data.totalMax}
              </span>
            </div>
            {predikat !== null && totalPercent !== null && (
              <div className="mt-3">
                <div
                  dir="rtl"
                  className="font-arabic text-2xl text-amber-300 leading-snug"
                >
                  {predikat.arab}
                </div>
                <div className="text-sm font-bold mt-1">
                  Predikat: {predikat.indo} ({totalPercent}%)
                </div>
              </div>
            )}
            <div className="text-xs text-zinc-300 mt-2">
              Diselesaikan dalam waktu{" "}
              <strong>
                {mins} menit {secs} detik
              </strong>
              {data.attempt.status === "TIME_UP" ? " • waktu habis" : ""}
            </div>
          </div>

          <div className="p-6 space-y-2">
            <h2 className="font-bold text-sm text-zinc-900">
              Skor per Maharoh
            </h2>
            {data.sections.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-sm"
              >
                <span className="font-semibold text-zinc-800">
                  {s.maharohName}
                  <span className="text-xs text-zinc-500 font-normal">
                    {" "}
                    • {s.questionCount} soal •{" "}
                    {s.status === "TIME_UP" ? "waktu habis" : "dikumpulkan"}
                  </span>
                </span>
                <span className="font-black text-zinc-900">
                  {s.score} / {s.maxScore}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Champion: leaderboard + sertifikat */}
        {data.exam.mode === "CHAMPION" && (
          <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-3 shadow-xs">
            <h2 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Leaderboard &amp; Sertifikat
            </h2>
            <p className="text-xs text-zinc-500">
              Peringkat memakai aturan yang diumumkan: nilai tertinggi, lalu
              paling dulu selesai, lalu durasi tercepat.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  router.push(
                    `/leaderboard/champion?examId=${data.exam.id}`
                  )
                }
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold cursor-pointer"
              >
                Lihat Leaderboard
              </button>
              {data.exam.certificateReleased ? (
                <button
                  onClick={() => router.push(`/sertifikat/${data.attempt.id}`)}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Award className="w-4 h-4" />
                  Unduh Sertifikat
                </button>
              ) : (
                <p className="text-xs text-zinc-500 self-center">
                  Sertifikat terbit setelah pengumuman resmi.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Pembahasan (simulasi saja) */}
        {data.showReview ? (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-zinc-900">
              Pembahasan Soal
            </h2>
            {data.sections.map((s) => (
              <div key={s.id} className="space-y-4">
                <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white text-xs">
                    {s.maharohName}
                  </span>
                  <span className="text-xs text-zinc-500 font-normal">
                    Skor {s.score} / {s.maxScore}
                  </span>
                </h3>
                {s.questions.map((q, qi) => {
                  const correct = q.options.find((o) => o.isCorrect);
                  const selected = q.options.find(
                    (o) => o.id === q.selectedOptionId
                  );
                  const isCorrect =
                    !!q.selectedOptionId &&
                    q.selectedOptionId === correct?.id;
                  return (
                    <div
                      key={q.id}
                      className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4 shadow-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white font-bold text-xs">
                          Soal {qi + 1}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-900 font-bold text-xs">
                          Bobot: {q.weight} Poin
                        </span>
                        {q.selectedOptionId === null ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 font-bold text-xs">
                            <MinusCircle className="w-3.5 h-3.5" />
                            Tidak dijawab
                          </span>
                        ) : isCorrect ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Benar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 text-red-700 font-bold text-xs">
                            <XCircle2 className="w-3.5 h-3.5" />
                            Salah — jawabanmu: {selected?.label}
                          </span>
                        )}
                      </div>

                      <div
                        dir={q.direction === "RTL" ? "rtl" : "ltr"}
                        className={`p-4 rounded-xl bg-yellow-50/40 border border-yellow-200/60 text-zinc-900 whitespace-pre-line ${
                          q.direction === "RTL"
                            ? "font-arabic text-2xl text-right"
                            : "text-sm sm:text-base"
                        }`}
                      >
                        {renderRichText(q.content)}
                      </div>

                      {q.audioUrl && (
                        <div className="flex items-center gap-2 text-xs text-zinc-600">
                          <Volume2 className="w-4 h-4" />
                          <audio controls src={q.audioUrl} className="h-9 flex-1" />
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {q.options.map((opt) => {
                          const isOptCorrect = opt.isCorrect;
                          const isOptSelected =
                            opt.id === q.selectedOptionId;
                          return (
                            <div
                              key={opt.id}
                              className={`p-3 rounded-xl border flex items-center gap-3 ${
                                isOptCorrect
                                  ? "bg-emerald-50 border-emerald-400 text-zinc-900"
                                  : isOptSelected
                                    ? "bg-red-50 border-red-300 text-zinc-900"
                                    : "bg-zinc-50/70 border-zinc-200 text-zinc-700"
                              }`}
                            >
                              <span
                                className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ${
                                  isOptCorrect
                                    ? "bg-emerald-600 text-white"
                                    : isOptSelected
                                      ? "bg-red-500 text-white"
                                      : "bg-zinc-200 text-zinc-700"
                                }`}
                              >
                                {opt.label}
                              </span>
                              <span
                                dir={
                                  opt.direction === "RTL" ? "rtl" : "ltr"
                                }
                                className={`flex-1 ${
                                  opt.direction === "RTL"
                                    ? "font-arabic text-xl text-right"
                                    : "text-xs sm:text-sm"
                                }`}
                              >
                                {renderRichText(opt.content)}
                              </span>
                              {isOptCorrect && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              )}
                              {isOptSelected && !isOptCorrect && (
                                <XCircle2 className="w-4 h-4 text-red-500 shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-zinc-800">
                          <span className="font-bold text-amber-800">
                            Pembahasan:{" "}
                          </span>
                          {renderRichText(q.explanation)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 text-center">
            Pembahasan soal tidak ditampilkan untuk TOAFL Champion.
          </p>
        )}

        <button
          onClick={() => router.push("/exam")}
          className="w-full py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Portal Peserta</span>
        </button>
      </div>
    </div>
  );
}
