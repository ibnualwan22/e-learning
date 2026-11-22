"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X } from "lucide-react";

interface ExamMaharohRecord {
  id: string;
  maharohId: string;
  orderIndex: number;
  minutes: number;
  audioRepeats: number;
  questionCount: number;
  maharoh: { id: string; name: string };
}

interface ExamRecord {
  id: string;
  mode: "SIMULASI" | "CHAMPION";
  levelId: string;
  title: string;
  description: string | null;
  isActive: boolean;
  startTime: string | null;
  endTime: string | null;
  autoSubmitOnViolation: boolean;
  level: { id: string; name: string } | null;
  maharohs: ExamMaharohRecord[];
}

interface LevelOption {
  id: string;
  name: string;
}

interface MaharohOption {
  id: string;
  name: string;
  defaultMinutes: number;
  defaultAudioRepeats: number;
}

interface MaharohRow {
  maharohId: string;
  minutes: number;
  audioRepeats: number;
  questionCount: number;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [maharohs, setMaharohs] = useState<MaharohOption[]>([]);
  const [bankCounts, setBankCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"SIMULASI" | "CHAMPION">("SIMULASI");
  const [levelId, setLevelId] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [rows, setRows] = useState<MaharohRow[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [examsRes, bankRes] = await Promise.all([
        fetch("/api/admin/exams"),
        fetch("/api/admin/bank-soal"),
      ]);
      if (
        examsRes.status === 403 ||
        examsRes.status === 401 ||
        bankRes.status === 403 ||
        bankRes.status === 401
      ) {
        router.push("/login");
        return;
      }
      const examsData = await examsRes.json();
      const bankData = await bankRes.json();
      setExams(examsData.exams || []);
      setLevels(bankData.levels || []);
      setMaharohs(bankData.maharohs || []);
      const counts: Record<string, number> = {};
      for (const q of bankData.questions || []) {
        const key = `${q.levelId}|${q.maharohId}`;
        counts[key] = (counts[key] || 0) + 1;
      }
      setBankCounts(counts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleModeChange(next: "SIMULASI" | "CHAMPION") {
    setMode(next);
    // Default auto-submit mengikuti mode (plan §6): Simulasi ya,
    // Champion tidak — admin tetap bisa mengubahnya manual.
    setAutoSubmit(next === "SIMULASI");
    if (next === "SIMULASI") {
      setStartTime("");
      setEndTime("");
    }
  }

  function openCreateModal() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setMode("SIMULASI");
    setLevelId(levels[0]?.id || "");
    setIsActive(false);
    setAutoSubmit(true);
    setStartTime("");
    setEndTime("");
    setRows([]);
    setError("");
    setShowModal(true);
  }

  function openEditModal(exam: ExamRecord) {
    setEditingId(exam.id);
    setTitle(exam.title);
    setDescription(exam.description || "");
    setMode(exam.mode);
    setLevelId(exam.levelId);
    setIsActive(exam.isActive);
    setAutoSubmit(exam.autoSubmitOnViolation);
    setStartTime(toLocalInput(exam.startTime));
    setEndTime(toLocalInput(exam.endTime));
    setRows(
      exam.maharohs.map((m) => ({
        maharohId: m.maharohId,
        minutes: m.minutes,
        audioRepeats: m.audioRepeats,
        questionCount: m.questionCount,
      }))
    );
    setError("");
    setShowModal(true);
  }

  function addRow() {
    const used = new Set(rows.map((r) => r.maharohId));
    const next = maharohs.find((m) => !used.has(m.id));
    if (!next) return;
    setRows((prev) => [
      ...prev,
      {
        maharohId: next.id,
        minutes: next.defaultMinutes,
        audioRepeats: next.defaultAudioRepeats,
        questionCount: 10,
      },
    ]);
  }

  function setRow(idx: number, patch: Partial<MaharohRow>) {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      // Bila maharoh diganti, isi menit & pengulangan dari defaultnya.
      if (patch.maharohId) {
        const m = maharohs.find((x) => x.id === patch.maharohId);
        if (m) {
          next[idx].minutes = m.defaultMinutes;
          next[idx].audioRepeats = m.defaultAudioRepeats;
        }
      }
      return next;
    });
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveRow(idx: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Judul exam wajib diisi");
      return;
    }
    if (!levelId) {
      setError("Level wajib dipilih");
      return;
    }
    if (rows.length === 0) {
      setError("Minimal 1 maharoh harus ditambahkan");
      return;
    }
    if (rows.some((r) => !r.maharohId)) {
      setError("Tiap baris maharoh wajib dipilih");
      return;
    }
    if (rows.some((r) => r.questionCount < 1)) {
      setError("Jumlah soal tiap maharoh minimal 1");
      return;
    }
    if (rows.some((r) => r.minutes < 1)) {
      setError("Menit tiap maharoh minimal 1");
      return;
    }
    if (mode === "CHAMPION" && startTime && endTime && endTime <= startTime) {
      setError("Waktu selesai harus setelah waktu mulai");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editingId ? `/api/admin/exams/${editingId}` : "/api/admin/exams",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            mode,
            levelId,
            isActive,
            autoSubmitOnViolation: autoSubmit,
            startTime: mode === "CHAMPION" ? startTime || null : null,
            endTime: mode === "CHAMPION" ? endTime || null : null,
            maharohs: rows.map((r, idx) => ({
              maharohId: r.maharohId,
              orderIndex: idx,
              minutes: Number(r.minutes),
              audioRepeats: Number(r.audioRepeats),
              questionCount: Number(r.questionCount),
            })),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan exam");
        return;
      }
      setShowModal(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(exam: ExamRecord) {
    if (!confirm(`Yakin ingin menghapus exam "${exam.title}"?`)) return;
    const res = await fetch(`/api/admin/exams/${exam.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Gagal menghapus exam");
      return;
    }
    await loadData();
  }

  const availableMaharohs = (currentId: string) => {
    const used = new Set(rows.map((r) => r.maharohId));
    return maharohs.filter((m) => m.id === currentId || !used.has(m.id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900">
            Exam TOAFL
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Buat exam Simulasi atau Champion per level. Atur maharoh beserta
            urutan, menit, jumlah soal, dan pengulangan audio.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold flex items-center gap-2 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Buat Exam
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
          Memuat exam...
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
          Belum ada exam. Buat exam Simulasi pertama.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-4 py-3 font-semibold">Exam</th>
                <th className="px-4 py-3 font-semibold">Mode</th>
                <th className="px-4 py-3 font-semibold">Level</th>
                <th className="px-4 py-3 font-semibold">Maharoh</th>
                <th className="px-4 py-3 font-semibold">Jadwal</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr
                  key={exam.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 align-top"
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-900">{exam.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {exam.description || "—"}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Auto-submit pelanggaran:{" "}
                      {exam.autoSubmitOnViolation ? "Ya" : "Tidak"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                        exam.mode === "SIMULASI"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {exam.mode === "SIMULASI" ? "Simulasi" : "Champion"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                    {exam.level?.name || "-"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {exam.maharohs.map((m) => (
                      <div key={m.id} className="whitespace-nowrap">
                        {m.maharoh.name} • {m.minutes} mnt • {m.questionCount}{" "}
                        soal • audio {m.audioRepeats}&times;
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                    {exam.mode === "SIMULASI" ? (
                      "Kapan saja"
                    ) : (
                      <>
                        <div>{fmtDate(exam.startTime)}</div>
                        <div>s.d. {fmtDate(exam.endTime)}</div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                        exam.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {exam.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(exam)}
                        aria-label="Ubah exam"
                        className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(exam)}
                        aria-label="Hapus exam"
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl border border-zinc-200 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 mb-5">
              <h2 className="text-lg font-bold text-zinc-900">
                {editingId ? "Ubah Exam" : "Buat Exam"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Tutup"
                className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2 mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Judul Exam
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="mis. Simulasi TOAFL Level 1"
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Deskripsi (opsional)
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="mis. Simulasi latihan untuk santri Markaz Arabiyah"
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Mode
                  </label>
                  <select
                    value={mode}
                    onChange={(e) =>
                      handleModeChange(e.target.value as "SIMULASI" | "CHAMPION")
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  >
                    <option value="SIMULASI">Simulasi</option>
                    <option value="CHAMPION">TOAFL Champion</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Level
                  </label>
                  <select
                    value={levelId}
                    onChange={(e) => setLevelId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  >
                    <option value="">— Pilih Level —</option>
                    {levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {mode === "CHAMPION" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      Mulai (opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      Selesai (opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 accent-yellow-600"
                  />
                  Exam aktif
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSubmit}
                    onChange={(e) => setAutoSubmit(e.target.checked)}
                    className="w-4 h-4 accent-yellow-600"
                  />
                  Auto-submit saat pelanggaran (default: Simulasi ya, Champion
                  tidak)
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-zinc-700">
                    Maharoh (berurutan — bisa digeser)
                  </label>
                  <button
                    type="button"
                    onClick={addRow}
                    disabled={rows.length >= maharohs.length}
                    className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Maharoh
                  </button>
                </div>
                {rows.length === 0 && (
                  <p className="text-sm text-zinc-500">
                    Belum ada maharoh. Tambahkan minimal 1 maharoh.
                  </p>
                )}
                <div className="space-y-2">
                  {rows.map((row, idx) => {
                    const bankCount = levelId
                      ? (bankCounts[`${levelId}|${row.maharohId}`] ?? 0)
                      : 0;
                    return (
                      <div
                        key={idx}
                        className="border border-zinc-200 rounded-xl p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-700 text-xs font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <select
                            value={row.maharohId}
                            onChange={(e) =>
                              setRow(idx, { maharohId: e.target.value })
                            }
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          >
                            {availableMaharohs(row.maharohId).map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => moveRow(idx, -1)}
                            disabled={idx === 0}
                            aria-label="Geser ke atas"
                            className="px-2 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold disabled:opacity-30 cursor-pointer"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(idx, 1)}
                            disabled={idx === rows.length - 1}
                            aria-label="Geser ke bawah"
                            className="px-2 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold disabled:opacity-30 cursor-pointer"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            aria-label="Hapus maharoh"
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pl-8">
                          <div>
                            <label className="block text-xs font-bold text-zinc-500 mb-0.5">
                              Menit
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={row.minutes}
                              onChange={(e) =>
                                setRow(idx, { minutes: Number(e.target.value) })
                              }
                              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-zinc-500 mb-0.5">
                              Jumlah Soal
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={row.questionCount}
                              onChange={(e) =>
                                setRow(idx, {
                                  questionCount: Number(e.target.value),
                                })
                              }
                              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-zinc-500 mb-0.5">
                              Putar Audio
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={row.audioRepeats}
                              onChange={(e) =>
                                setRow(idx, {
                                  audioRepeats: Number(e.target.value),
                                })
                              }
                              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            />
                          </div>
                        </div>
                        {levelId && (
                          <p
                            className={`text-xs pl-8 ${
                              row.questionCount > bankCount
                                ? "text-amber-700 font-semibold"
                                : "text-zinc-500"
                            }`}
                          >
                            Bank soal level ini untuk maharoh ini: {bankCount}{" "}
                            soal
                            {row.questionCount > bankCount
                              ? ` — kurang ${row.questionCount - bankCount} soal, tambahkan dulu di Bank Soal TOAFL.`
                              : "."}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-semibold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : "Simpan Exam"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
