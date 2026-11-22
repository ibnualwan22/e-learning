"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Volume2,
  Upload,
} from "lucide-react";
import { getTextDirection } from "@/lib/text-direction";

interface OptionRecord {
  id: string;
  label: string;
  content: string;
  direction: string;
  isCorrect: boolean;
  contentType: string;
  audioUrl: string | null;
}

interface QuestionRecord {
  id: string;
  content: string;
  direction: string;
  weight: number;
  explanation: string | null;
  audioUrl: string | null;
  levelId: string | null;
  maharohId: string | null;
  level: { id: string; name: string } | null;
  maharoh: { id: string; name: string } | null;
  options: OptionRecord[];
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

interface OptionForm {
  label: string;
  content: string;
  isCorrect: boolean;
  contentType: "TEXT" | "AUDIO";
  audioUrl: string;
}

const EMPTY_OPTIONS: OptionForm[] = [
  { label: "A", content: "", isCorrect: true, contentType: "TEXT", audioUrl: "" },
  { label: "B", content: "", isCorrect: false, contentType: "TEXT", audioUrl: "" },
  { label: "C", content: "", isCorrect: false, contentType: "TEXT", audioUrl: "" },
  { label: "D", content: "", isCorrect: false, contentType: "TEXT", audioUrl: "" },
];

async function uploadAudio(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/audio/upload", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Gagal mengunggah audio");
  }
  return data.url as string;
}

export default function AdminBankSoalPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [maharohs, setMaharohs] = useState<MaharohOption[]>([]);
  const [filterLevel, setFilterLevel] = useState("");
  const [filterMaharoh, setFilterMaharoh] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState("");
  const [maharohId, setMaharohId] = useState("");
  const [content, setContent] = useState("");
  const [weight, setWeight] = useState(1);
  const [explanation, setExplanation] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [options, setOptions] = useState<OptionForm[]>(EMPTY_OPTIONS);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterLevel) params.set("levelId", filterLevel);
      if (filterMaharoh) params.set("maharohId", filterMaharoh);
      const res = await fetch(`/api/admin/bank-soal?${params.toString()}`);
      if (res.status === 403 || res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setLevels(data.levels || []);
      setMaharohs(data.maharohs || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLevel, filterMaharoh]);

  function openCreateModal() {
    setEditingId(null);
    setLevelId(filterLevel || levels[0]?.id || "");
    setMaharohId(filterMaharoh || maharohs[0]?.id || "");
    setContent("");
    setWeight(1);
    setExplanation("");
    setAudioUrl("");
    setOptions(EMPTY_OPTIONS.map((o) => ({ ...o })));
    setError("");
    setShowModal(true);
  }

  function openEditModal(q: QuestionRecord) {
    setEditingId(q.id);
    setLevelId(q.levelId || "");
    setMaharohId(q.maharohId || "");
    setContent(q.content);
    setWeight(q.weight);
    setExplanation(q.explanation || "");
    setAudioUrl(q.audioUrl || "");
    setOptions(
      q.options.map((o) => ({
        label: o.label,
        content: o.content,
        isCorrect: o.isCorrect,
        contentType: o.contentType === "AUDIO" ? "AUDIO" : "TEXT",
        audioUrl: o.audioUrl || "",
      }))
    );
    setError("");
    setShowModal(true);
  }

  function setOption(idx: number, patch: Partial<OptionForm>) {
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, ...patch } : o))
    );
  }

  function markCorrect(idx: number) {
    setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === idx })));
  }

  function addOption() {
    setOptions((prev) => [
      ...prev,
      {
        label: String.fromCharCode(65 + prev.length),
        content: "",
        isCorrect: false,
        contentType: "TEXT",
        audioUrl: "",
      },
    ]);
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return;
    setOptions((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Bila opsi benar ikut terhapus, jadikan opsi pertama sebagai kunci.
      if (!next.some((o) => o.isCorrect) && next.length > 0) {
        next[0].isCorrect = true;
      }
      return next.map((o, i) => ({
        ...o,
        label: String.fromCharCode(65 + i),
      }));
    });
  }

  async function handleAudioFile(
    key: string,
    file: File | undefined,
    apply: (url: string) => void
  ) {
    if (!file) return;
    setUploadingKey(key);
    setError("");
    try {
      const url = await uploadAudio(file);
      apply(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah audio");
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleSave() {
    if (!levelId || !maharohId) {
      setError("Level dan maharoh wajib dipilih");
      return;
    }
    if (!content.trim()) {
      setError("Teks soal wajib diisi");
      return;
    }
    if (options.length < 2) {
      setError("Minimal harus ada 2 opsi jawaban");
      return;
    }
    if (!options.some((o) => o.isCorrect)) {
      setError("Pilih salah satu opsi sebagai kunci jawaban benar");
      return;
    }
    if (
      options.some((o) => !o.content.trim() && !o.audioUrl.trim())
    ) {
      setError("Tiap opsi harus punya teks atau audio");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editingId
          ? `/api/admin/bank-soal/${editingId}`
          : "/api/admin/bank-soal",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            levelId,
            maharohId,
            direction: getTextDirection(content),
            weight: Number(weight) || 1,
            content,
            explanation,
            audioUrl: audioUrl || null,
            options: options.map((o) => ({
              label: o.label,
              content: o.content,
              isCorrect: o.isCorrect,
              direction: getTextDirection(o.content || ""),
              contentType: o.contentType,
              audioUrl: o.audioUrl || null,
            })),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan soal");
        return;
      }
      setShowModal(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(q: QuestionRecord) {
    if (!confirm(`Yakin ingin menghapus soal ini?\n\n${q.content.slice(0, 120)}`)) return;
    const res = await fetch(`/api/admin/bank-soal/${q.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Gagal menghapus soal");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900">
            Bank Soal TOAFL
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Soal pilihan ganda per level &times; maharoh. Opsi bisa teks atau
            audio; soal audio (Istima') diunggah sebagai file.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold flex items-center gap-2 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Tambah Soal
        </button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          <option value="">Semua Level</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={filterMaharoh}
          onChange={(e) => setFilterMaharoh(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          <option value="">Semua Maharoh</option>
          {maharohs.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
          Memuat bank soal...
        </div>
      ) : questions.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
          Belum ada soal untuk filter ini. Tambahkan soal pertama.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-4 py-3 font-semibold">Soal</th>
                <th className="px-4 py-3 font-semibold">Level</th>
                <th className="px-4 py-3 font-semibold">Maharoh</th>
                <th className="px-4 py-3 font-semibold text-center">Bobot</th>
                <th className="px-4 py-3 font-semibold text-center">Opsi</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => {
                const correct = q.options.find((o) => o.isCorrect);
                return (
                  <tr
                    key={q.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 align-top"
                  >
                    <td className="px-4 py-3 text-zinc-900 max-w-md">
                      <div
                        dir={getTextDirection(q.content)}
                        className="line-clamp-2"
                      >
                        {q.content}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {q.audioUrl && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                            <Volume2 className="w-3 h-3" /> Audio soal
                          </span>
                        )}
                        {q.options.some((o) => o.contentType === "AUDIO") && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-800">
                            <Volume2 className="w-3 h-3" /> Opsi audio
                          </span>
                        )}
                        {q.explanation && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-100 text-zinc-600">
                            Ada pembahasan
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                      {q.level?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                      {q.maharoh?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-600">
                      {q.weight}
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-600 whitespace-nowrap">
                      {q.options.length} opsi
                      {correct ? ` • Kunci ${correct.label}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(q)}
                          aria-label="Ubah soal"
                          className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(q)}
                          aria-label="Hapus soal"
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl border border-zinc-200 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 mb-5">
              <h2 className="text-lg font-bold text-zinc-900">
                {editingId ? "Edit Soal TOAFL" : "Tambah Soal TOAFL"}
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
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Maharoh
                  </label>
                  <select
                    value={maharohId}
                    onChange={(e) => setMaharohId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  >
                    <option value="">— Pilih Maharoh —</option>
                    {maharohs.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Teks Soal
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  dir={getTextDirection(content)}
                  rows={3}
                  placeholder="Tulis soal di sini (Arab atau Indonesia — arah tulisan menyesuaikan otomatis)"
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Bobot
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Audio Soal (Istima') — opsional
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={audioUrl}
                      onChange={(e) => setAudioUrl(e.target.value)}
                      placeholder="URL audio atau unggah file"
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                    <label className="shrink-0 px-3 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-semibold flex items-center gap-1.5 cursor-pointer transition">
                      <Upload className="w-4 h-4" />
                      {uploadingKey === "q" ? "Mengunggah..." : "Unggah"}
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          handleAudioFile("q", e.target.files?.[0], setAudioUrl);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {audioUrl && (
                    <audio controls src={audioUrl} className="w-full mt-2 h-9" />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Pembahasan (ditampilkan di Simulasi setelah selesai)
                </label>
                <textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  rows={2}
                  placeholder="Penjelasan kunci jawaban (opsional)"
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-zinc-700">
                    Opsi Jawaban (pilih satu sebagai kunci)
                  </label>
                  <button
                    type="button"
                    onClick={addOption}
                    className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Opsi
                  </button>
                </div>
                <div className="space-y-2">
                  {options.map((o, idx) => (
                    <div
                      key={idx}
                      className="border border-zinc-200 rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correct-option"
                          checked={o.isCorrect}
                          onChange={() => markCorrect(idx)}
                          className="w-4 h-4 accent-yellow-600 shrink-0"
                          aria-label={`Jadikan opsi ${o.label} sebagai kunci`}
                        />
                        <span className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-700 text-xs font-black flex items-center justify-center shrink-0">
                          {o.label}
                        </span>
                        <input
                          value={o.content}
                          onChange={(e) =>
                            setOption(idx, { content: e.target.value })
                          }
                          dir={getTextDirection(o.content)}
                          placeholder={
                            o.contentType === "AUDIO"
                              ? "Transkrip/label opsi audio (boleh dikosongkan bila ada audio)"
                              : "Teks opsi jawaban"
                          }
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        />
                        <select
                          value={o.contentType}
                          onChange={(e) =>
                            setOption(idx, {
                              contentType: e.target.value as "TEXT" | "AUDIO",
                            })
                          }
                          className="px-2 py-2 rounded-lg border border-zinc-300 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        >
                          <option value="TEXT">Teks</option>
                          <option value="AUDIO">Audio</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeOption(idx)}
                          disabled={options.length <= 2}
                          aria-label={`Hapus opsi ${o.label}`}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition cursor-pointer disabled:opacity-30"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {o.contentType === "AUDIO" && (
                        <div className="flex gap-2 pl-12">
                          <input
                            value={o.audioUrl}
                            onChange={(e) =>
                              setOption(idx, { audioUrl: e.target.value })
                            }
                            placeholder="URL audio opsi atau unggah file"
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          />
                          <label className="shrink-0 px-3 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition">
                            <Upload className="w-3.5 h-3.5" />
                            {uploadingKey === `opt-${idx}`
                              ? "Mengunggah..."
                              : "Unggah"}
                            <input
                              type="file"
                              accept="audio/*"
                              className="hidden"
                              onChange={(e) => {
                                handleAudioFile(
                                  `opt-${idx}`,
                                  e.target.files?.[0],
                                  (url) => setOption(idx, { audioUrl: url })
                                );
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      )}
                      {o.audioUrl && (
                        <div className="pl-12">
                          <audio controls src={o.audioUrl} className="w-full h-9" />
                        </div>
                      )}
                    </div>
                  ))}
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
                  {saving ? "Menyimpan..." : "Simpan Soal"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
