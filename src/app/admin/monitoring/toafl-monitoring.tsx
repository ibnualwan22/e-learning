"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Clock,
  Eye,
  X,
  AlertTriangle,
  Search,
} from "lucide-react";

// TOAFL Fase 5 — monitoring live mesin ujian TOAFL: attempt berjalan,
// detail jawaban per soal + kolom Jeda, dan daftar pelanggaran.
// Kolom Jeda adalah SINYAL POLA, bukan bukti — tanpa diskualifikasi
// otomatis (§6 plan).

interface ToaflExam {
  id: string;
  title: string;
  mode: "SIMULASI" | "CHAMPION";
  isActive: boolean;
  _count: { attempts: number };
}

interface ToaflAttemptRow {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "TIME_UP";
  startedAt: string;
  finishedAt: string | null;
  timeSpentSeconds: number | null;
  rawScore: number;
  finalScore: number;
  user: {
    id: string;
    username: string;
    name: string;
    institution: string | null;
  };
  currentMaharohName: string | null;
  remainingSeconds: number | null;
  answeredCount: number;
  totalQuestions: number;
  violationCount: number;
  sections: { maharohId: string; maharohName: string; status: string; score: number }[];
}

interface ToaflViolationRow {
  id: string;
  type: string;
  at: string;
  detail: string | null;
  attemptId: string;
  username: string;
  name: string;
  examTitle: string;
}

interface DetailAnswer {
  maharohName: string;
  order: number;
  questionId: string;
  content: string;
  selectedLabel: string | null;
  selectedContent: string | null;
  isCorrect: boolean | null;
  isDoubtful: boolean;
  answeredAt: string;
  jedaMs: number | null;
}

interface DetailData {
  attempt: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    timeSpentSeconds: number | null;
    rawScore: number;
    finalScore: number;
    currentMaharohId: string | null;
    user: {
      id: string;
      username: string;
      name: string;
      institution: string | null;
    };
    exam: {
      id: string;
      title: string;
      mode: string;
      level: { id: string; name: string };
      maharohs: {
        maharohId: string;
        name: string;
        orderIndex: number;
        minutes: number;
      }[];
    };
  };
  sections: {
    id: string;
    maharohId: string;
    maharohName: string;
    status: string;
    startedAt: string;
    expiresAt: string;
    finishedAt: string | null;
    score: number;
    questionCount: number;
  }[];
  answers: DetailAnswer[];
  violations: { id: string; type: string; at: string; detail: string | null }[];
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function formatJeda(ms: number | null) {
  if (ms === null || ms < 0) return "-";
  const totalDetik = ms / 1000;
  if (totalDetik < 60) return `${totalDetik.toFixed(1)}d`;
  const m = Math.floor(totalDetik / 60);
  const s = totalDetik - m * 60;
  return `${m}m ${s.toFixed(1)}d`;
}

function formatRemaining(sec: number | null): string {
  if (sec === null) return "-";
  if (sec <= 0) return "Waktu habis";
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}j ${m}m`;
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}d`;
}

function formatClock(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ToaflMonitoring() {
  const [exams, setExams] = useState<ToaflExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [attempts, setAttempts] = useState<ToaflAttemptRow[]>([]);
  const [summary, setSummary] = useState<{
    totalAttempts: number;
    working: number;
    finished: number;
    totalViolations: number;
  } | null>(null);
  const [violations, setViolations] = useState<ToaflViolationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "WORKING" | "FINISHED">("ALL");

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Jam server + detak 1 detik untuk hitung mundur sisa waktu yang live.
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const serverNowMs = nowMs + serverOffsetMs;

  const loadData = useCallback(async (examId?: string) => {
    setLoading(true);
    try {
      const query = examId ? `?examId=${examId}` : "";
      const res = await fetch(`/api/admin/monitoring/toafl${query}`);
      const data = await res.json();
      setExams(data.exams || []);
      if (!examId && data.selectedExamId) {
        setSelectedExamId(data.selectedExamId);
      }
      setAttempts(data.attempts || []);
      setSummary(data.summary || null);
      setViolations(data.violations || []);
      if (data.serverTime) {
        setServerOffsetMs(new Date(data.serverTime).getTime() - Date.now());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(selectedExamId || undefined);
    const interval = setInterval(() => {
      void loadData(selectedExamId || undefined);
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedExamId, loadData]);

  async function openDetail(attemptId: string) {
    setDetailId(attemptId);
    setDetailData(null);
    setDetailError("");
    setActionMsg("");
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/admin/monitoring/toafl?attemptId=${attemptId}`
      );
      const data = await res.json();
      if (!res.ok) {
        setDetailError(data.error || "Gagal memuat detail");
        return;
      }
      setDetailData(data);
    } catch {
      setDetailError("Gagal terhubung ke server");
    } finally {
      setDetailLoading(false);
    }
  }

  // Aksi admin (SIMULASI saja): pindahkan peserta ke sebuah maharoh
  // (Lanjutkan Ujian / ke maharoh yang terlewat atau terkunci) atau mulai
  // dari awal (hapus attempt total). Sesudah berhasil, muat ulang detail
  // + daftar supaya status terbaru langsung terlihat.
  async function handleMove(maharohId?: string) {
    if (!detailData || actionBusy) return;
    const label = maharohId
      ? detailData.attempt.exam.maharohs.find((m) => m.maharohId === maharohId)
          ?.name
      : "maharoh yang relevan";
    if (
      !window.confirm(
        `Pindahkan ${detailData.attempt.user.name} ke ${label}? Maharoh yang sedang berjalan akan ditutup (skor apa adanya); maharoh tujuan dibuka dengan waktu baru dan jawaban lama tetap tersimpan.`
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/monitoring/toafl/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: detailData.attempt.id, maharohId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionMsg(data.error || "Gagal memindahkan peserta");
        return;
      }
      setActionMsg(
        `Peserta dipindahkan ke Maharoh ${data.maharohName}. Minta peserta membuka kembali halaman ujian.`
      );
      await openDetail(detailData.attempt.id);
      await loadData(selectedExamId || undefined);
    } catch {
      setActionMsg("Gagal terhubung ke server");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRestart() {
    if (!detailData || actionBusy) return;
    if (
      !window.confirm(
        `Mulai dari awal untuk ${detailData.attempt.user.name}? Attempt ini DIHAPUS TOTAL (jawaban, skor, dan pelanggaran ikut hilang) lalu dibuat attempt baru yang bersih. Tindakan ini tidak bisa dibatalkan.`
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/monitoring/toafl/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: detailData.attempt.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionMsg(data.error || "Gagal memulai ulang dari awal");
        return;
      }
      setActionMsg(
        "Attempt lama dihapus dan attempt baru sudah dibuat. Minta peserta membuka kembali halaman ujian."
      );
      await openDetail(data.attemptId);
      await loadData(selectedExamId || undefined);
    } catch {
      setActionMsg("Gagal terhubung ke server");
    } finally {
      setActionBusy(false);
    }
  }

  const filteredAttempts = attempts
    .filter((a) => {
      if (statusFilter === "WORKING") return a.status === "IN_PROGRESS";
      if (statusFilter === "FINISHED") return a.status !== "IN_PROGRESS";
      return true;
    })
    .filter((a) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        a.user.name.toLowerCase().includes(q) ||
        a.user.username.toLowerCase().includes(q) ||
        (a.user.institution || "").toLowerCase().includes(q)
      );
    });

  // Sisa waktu live dari serverTime (bukan jam perangkat saja).
  const liveRemaining = (a: ToaflAttemptRow): string => {
    if (a.status !== "IN_PROGRESS" || a.remainingSeconds === null) return "-";
    if (!serverNowMs) return formatRemaining(a.remainingSeconds);
    const sec = a.remainingSeconds;
    return formatRemaining(sec);
  };

  const statusBadge = (a: ToaflAttemptRow) => {
    if (a.status === "IN_PROGRESS") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-900 text-xs font-bold">
          <Clock className="w-3.5 h-3.5" /> Sedang Mengerjakan
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-zinc-800 text-xs font-bold">
        Selesai ({a.status === "TIME_UP" ? "waktu habis" : "dikumpulkan"})
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900">
            Monitoring TOAFL
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Pantau attempt TOAFL yang sedang berjalan, detail waktu per soal
            (kolom Jeda), dan pelanggaran yang tercatat.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-xs sm:text-sm font-semibold"
          >
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} ({e.mode}) — {e._count.attempts} attempt
              </option>
            ))}
          </select>

          <button
            onClick={() => loadData(selectedExamId)}
            className="px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Ringkasan */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Attempt", value: summary.totalAttempts },
            { label: "Sedang Mengerjakan", value: summary.working },
            { label: "Selesai", value: summary.finished },
            { label: "Pelanggaran", value: summary.totalViolations },
          ].map((c) => (
            <div
              key={c.label}
              className="bg-white rounded-xl border border-zinc-200 p-4"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                {c.label}
              </div>
              <div className="text-2xl font-black text-zinc-900 mt-1">
                {c.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama / username / instansi..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-300 bg-white text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "ALL" | "WORKING" | "FINISHED")
          }
          className="px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white text-sm font-semibold"
        >
          <option value="ALL">Semua status</option>
          <option value="WORKING">Sedang mengerjakan</option>
          <option value="FINISHED">Selesai</option>
        </select>
      </div>

      {/* Tabel attempt */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="p-3">Peserta</th>
                <th className="p-3">Status</th>
                <th className="p-3">Maharoh Berjalan</th>
                <th className="p-3">Sisa Waktu</th>
                <th className="p-3">Terjawab</th>
                <th className="p-3">Skor</th>
                <th className="p-3">Pelanggaran</th>
                <th className="p-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttempts.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-zinc-100 hover:bg-zinc-50"
                >
                  <td className="p-3">
                    <div className="font-semibold text-zinc-900">{a.user.name}</div>
                    <div className="text-xs text-zinc-500">
                      @{a.user.username}
                      {a.user.institution ? ` • ${a.user.institution}` : ""}
                    </div>
                    <div className="text-xs text-zinc-400">
                      Mulai {formatClock(a.startedAt)}
                    </div>
                  </td>
                  <td className="p-3">{statusBadge(a)}</td>
                  <td className="p-3 font-medium text-zinc-800">
                    {a.currentMaharohName || "-"}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    {liveRemaining(a)}
                  </td>
                  <td className="p-3">
                    {a.answeredCount}/{a.totalQuestions}
                  </td>
                  <td className="p-3 font-bold">
                    {a.status === "IN_PROGRESS" ? "-" : a.finalScore}
                  </td>
                  <td className="p-3">
                    {a.violationCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {a.violationCount}x
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-xs">0</span>
                    )}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => openDetail(a.id)}
                      className="p-2 rounded-lg border border-zinc-300 hover:bg-zinc-100 cursor-pointer"
                      aria-label="Lihat detail"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredAttempts.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="p-6 text-center text-sm text-zinc-500"
                  >
                    {loading
                      ? "Memuat..."
                      : "Belum ada attempt untuk exam ini."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pelanggaran terakhir */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 font-bold text-sm text-zinc-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          Pelanggaran Terakhir
        </div>
        {violations.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">
            Belum ada pelanggaran tercatat.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {violations.map((v) => (
              <li
                key={v.id}
                className="px-4 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span className="font-mono text-xs text-zinc-500">
                  {formatClock(v.at)}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-bold">
                  {v.type}
                </span>
                <span className="font-semibold text-zinc-900">
                  {v.name} (@{v.username})
                </span>
                <span className="text-zinc-500">{v.examTitle}</span>
                {v.detail && (
                  <span className="text-xs text-zinc-400">— {v.detail}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="px-4 py-3 text-xs text-zinc-400 border-t border-zinc-100">
          Pelanggaran yang tercatat hanya sinyal untuk admin. Untuk simulasi,
          pelanggaran hanya memunculkan peringatan — maharoh tidak lagi
          ditutup otomatis (teks yang dilihat peserta tetap menyebut
          auto-submit sebagai gertakan). Untuk champion, pelanggaran hanya
          dicatat.
        </p>
      </div>

      {/* Modal detail */}
      {detailId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div
            className="absolute inset-0 bg-zinc-950/60"
            onClick={() => setDetailId(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-zinc-900">
                  Detail Attempt TOAFL
                </h2>
                <p className="text-xs text-zinc-500">
                  {detailData
                    ? `${detailData.attempt.user.name} (@${detailData.attempt.user.username}) • ${detailData.attempt.exam.title}`
                    : "Memuat..."}
                </p>
              </div>
              <button
                onClick={() => setDetailId(null)}
                className="p-2 rounded-lg hover:bg-zinc-100 cursor-pointer"
                aria-label="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {detailLoading && (
                <p className="text-sm text-zinc-500">Memuat detail...</p>
              )}
              {detailError && (
                <p className="text-sm text-red-600">{detailError}</p>
              )}
              {detailData && (
                <>
                  {/* Skor per maharoh */}
                  <div className="space-y-2">
                    <h3 className="font-bold text-sm text-zinc-900">
                      Skor per Maharoh
                    </h3>
                    {detailData.sections.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm"
                      >
                        <span className="font-semibold text-zinc-800">
                          {s.maharohName}
                          <span className="text-xs text-zinc-500 font-normal">
                            {" "}
                            • {s.questionCount} soal •{" "}
                            {s.status === "TIME_UP"
                              ? "waktu habis"
                              : s.status === "SUBMITTED"
                                ? "dikumpulkan"
                                : "berjalan"}
                          </span>
                        </span>
                        <span className="font-black text-zinc-900">
                          {s.score}
                        </span>
                      </div>
                    ))}
                    <p className="text-sm text-zinc-600">
                      Total:{" "}
                      <strong>{detailData.attempt.finalScore}</strong>
                      {detailData.attempt.timeSpentSeconds !== null &&
                        ` • ${Math.floor(detailData.attempt.timeSpentSeconds / 60)}m ${detailData.attempt.timeSpentSeconds % 60}d`}
                    </p>
                  </div>

                  {/* Lanjutkan / pindah maharoh + mulai dari awal (SIMULASI) */}
                  {detailData.attempt.exam.mode === "SIMULASI" && (
                    <div className="space-y-2">
                      <h3 className="font-bold text-sm text-zinc-900">
                        Lanjutkan / Pindah Maharoh
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Pindahkan peserta ke maharoh yang terlewat atau
                        terkunci. Maharoh tujuan dibuka dengan waktu baru
                        dan jawaban lama tetap tersimpan; maharoh yang
                        sedang berjalan ditutup dengan skor apa adanya.
                      </p>
                      {detailData.attempt.exam.maharohs.map((m) => {
                        const sec = detailData.sections.find(
                          (s) => s.maharohId === m.maharohId
                        );
                        const isCurrent =
                          sec?.status === "IN_PROGRESS" &&
                          detailData.attempt.currentMaharohId ===
                            m.maharohId;
                        return (
                          <div
                            key={m.maharohId}
                            className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm"
                          >
                            <span className="font-semibold text-zinc-800">
                              {m.name}
                              <span className="text-xs text-zinc-500 font-normal">
                                {" "}
                                •{" "}
                                {sec
                                  ? sec.status === "TIME_UP"
                                    ? `waktu habis (skor ${sec.score})`
                                    : sec.status === "SUBMITTED"
                                      ? `dikumpulkan (skor ${sec.score})`
                                      : "berjalan"
                                  : "belum dimulai"}
                              </span>
                            </span>
                            {!isCurrent && (
                              <button
                                type="button"
                                disabled={actionBusy}
                                onClick={() => handleMove(m.maharohId)}
                                className="shrink-0 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                              >
                                Lanjutkan ke sini
                              </button>
                            )}
                            {isCurrent && (
                              <span className="text-xs font-bold text-emerald-700">
                                Sedang dikerjakan
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleMove()}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-zinc-950 text-xs font-bold cursor-pointer"
                        >
                          Lanjutkan Ujian
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleRestart()}
                          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                        >
                          Mulai dari Awal
                        </button>
                      </div>
                      <p className="text-xs text-zinc-500">
                        &ldquo;Mulai dari Awal&rdquo; menghapus attempt ini
                        total (jawaban, skor, dan pelanggaran ikut hilang)
                        lalu membuat attempt baru yang bersih.
                      </p>
                      {actionMsg && (
                        <p className="text-sm text-zinc-700 font-medium">
                          {actionMsg}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Pelanggaran attempt ini */}
                  <div className="space-y-2">
                    <h3 className="font-bold text-sm text-zinc-900">
                      Pelanggaran ({detailData.violations.length})
                    </h3>
                    {detailData.violations.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        Tidak ada pelanggaran tercatat.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {detailData.violations.map((v) => (
                          <li
                            key={v.id}
                            className="text-sm flex flex-wrap gap-x-3"
                          >
                            <span className="font-mono text-xs text-zinc-500">
                              {formatClock(v.at)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-bold">
                              {v.type}
                            </span>
                            {v.detail && (
                              <span className="text-xs text-zinc-500">
                                {v.detail}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Jawaban + Jeda */}
                  <div className="space-y-2">
                    <h3 className="font-bold text-sm text-zinc-900">
                      Jawaban per Soal + Jeda
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Jeda = selisih simpanan jawaban dengan simpanan
                      sebelumnya secara kronologis dalam satu maharoh;
                      jawaban pertama dihitung dari waktu mulai maharoh
                      itu. Jeda adalah sinyal pola, bukan bukti.
                    </p>
                    <div className="overflow-x-auto border border-zinc-200 rounded-xl">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500">
                            <th className="p-3">Maharoh</th>
                            <th className="p-3">No</th>
                            <th className="p-3">Soal</th>
                            <th className="p-3">Jawaban</th>
                            <th className="p-3">Benar/Salah</th>
                            <th className="p-3">Jeda</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailData.answers.map((ans) => (
                            <tr
                              key={ans.questionId}
                              className="border-b border-zinc-100"
                            >
                              <td className="p-3 whitespace-nowrap">
                                {ans.maharohName}
                              </td>
                              <td className="p-3">{ans.order}</td>
                              <td className="p-3 max-w-xs">
                                <span className="line-clamp-2">
                                  {stripTags(ans.content)}
                                </span>
                              </td>
                              <td className="p-3">
                                {ans.selectedLabel ? (
                                  <span className="font-semibold">
                                    {ans.selectedLabel}.{" "}
                                  </span>
                                ) : (
                                  <span className="text-zinc-400">-</span>
                                )}
                                <span className="text-zinc-600">
                                  {ans.selectedContent
                                    ? stripTags(ans.selectedContent)
                                    : ""}
                                </span>
                                {ans.isDoubtful && (
                                  <span className="ml-1 text-xs text-amber-700">
                                    (ragu)
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                {ans.isCorrect === null ? (
                                  <span className="text-zinc-400 font-bold">
                                    -
                                  </span>
                                ) : ans.isCorrect ? (
                                  <span className="text-emerald-700 font-bold">
                                    ✓ Benar
                                  </span>
                                ) : (
                                  <span className="text-red-600 font-bold">
                                    ✗ Salah
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-xs text-zinc-700 whitespace-nowrap">
                                {formatJeda(ans.jedaMs)}
                              </td>
                            </tr>
                          ))}
                          {detailData.answers.length === 0 && (
                            <tr>
                              <td
                                colSpan={6}
                                className="p-4 text-center text-sm text-zinc-500"
                              >
                                Belum ada jawaban tersimpan.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
