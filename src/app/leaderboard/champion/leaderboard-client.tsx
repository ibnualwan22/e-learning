"use client";

import { useEffect, useState } from "react";
import { Trophy, Medal } from "lucide-react";

interface ExamOption {
  id: string;
  title: string;
  isActive: boolean;
  levelName: string;
}

interface LeaderboardRow {
  rank: number;
  attemptId: string;
  userId: string;
  userName: string;
  finalScore: number;
  finishedAt: string | null;
  timeSpentSeconds: number | null;
}

interface LeaderboardData {
  exam: {
    id: string;
    title: string;
    levelName: string;
    certificateReleased: boolean;
  };
  rows: LeaderboardRow[];
  selfRank: number | null;
  selfAttemptId: string | null;
  total: number;
}

function formatDuration(sec: number | null): string {
  if (sec === null || sec === undefined) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}d`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeaderboardClient({
  initialExamId,
}: {
  initialExamId: string;
}) {
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [examId, setExamId] = useState(initialExamId);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/leaderboard");
        const d = await res.json();
        setExams(d.exams || []);
        if (!initialExamId && d.exams?.length > 0) {
          setExamId(d.exams[0].id);
        }
      } catch {
        setError("Gagal memuat daftar exam");
      }
    })();
  }, [initialExamId]);

  useEffect(() => {
    if (!examId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(`/api/leaderboard?examId=${examId}`);
        const d = await res.json();
        if (!res.ok) {
          setError(d.error || "Gagal memuat leaderboard");
          setData(null);
          return;
        }
        setData(d as LeaderboardData);
      } catch {
        setError("Gagal menghubungi server");
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  return (
    <div className="min-h-screen bg-zinc-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center mx-auto mb-3">
            <Trophy className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-900">
            Leaderboard TOAFL Champion
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Peringkat: nilai tertinggi, lalu paling dulu selesai, lalu durasi
            tercepat. Menampilkan 100 teratas.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <label className="block text-xs font-bold text-zinc-700 mb-1">
            Pilih Exam Champion
          </label>
          <select
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
          >
            {exams.length === 0 && <option value="">— Belum ada exam Champion —</option>}
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} • {e.levelName}
                {e.isActive ? "" : " (nonaktif)"}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500 animate-pulse">
            Memuat leaderboard...
          </div>
        ) : data ? (
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-zinc-200">
              <h2 className="font-bold text-zinc-900">{data.exam.title}</h2>
              <p className="text-xs text-zinc-500">
                Level {data.exam.levelName} • {data.total} peserta selesai
                {data.selfRank !== null && (
                  <>
                    {" • "}
                    <span className="font-bold text-amber-700">
                      Peringkatmu: #{data.selfRank}
                    </span>
                  </>
                )}
              </p>
            </div>
            {data.rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">
                Belum ada peserta yang menyelesaikan exam ini.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-zinc-500">
                      <th className="px-4 py-3 font-semibold w-16 text-center">#</th>
                      <th className="px-4 py-3 font-semibold">Nama</th>
                      <th className="px-4 py-3 font-semibold text-center">Skor</th>
                      <th className="px-4 py-3 font-semibold text-center">Durasi</th>
                      <th className="px-4 py-3 font-semibold">Selesai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => {
                      const isSelf = r.attemptId === data.selfAttemptId;
                      return (
                        <tr
                          key={r.attemptId}
                          className={`border-b border-zinc-100 last:border-0 ${
                            isSelf
                              ? "bg-amber-50 font-semibold"
                              : "hover:bg-zinc-50"
                          }`}
                        >
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-black text-xs ${
                                r.rank === 1
                                  ? "bg-amber-400 text-zinc-950"
                                  : r.rank === 2
                                    ? "bg-zinc-200 text-zinc-800"
                                    : r.rank === 3
                                      ? "bg-amber-700 text-white"
                                      : "bg-zinc-100 text-zinc-700"
                              }`}
                            >
                              {r.rank <= 3 ? (
                                <Medal className="w-4 h-4" />
                              ) : (
                                r.rank
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-900">
                            {r.userName}
                            {isSelf && (
                              <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 text-xs font-bold">
                                Kamu
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-black text-zinc-900">
                            {r.finalScore}
                          </td>
                          <td className="px-4 py-3 text-center text-zinc-600">
                            {formatDuration(r.timeSpentSeconds)}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                            {formatDate(r.finishedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
