"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Search,
  X,
  Volume2,
  Upload,
} from "lucide-react";
import { renderRichText } from "@/lib/safeHtml";
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

interface ImportPreviewRow {
  index: number;
  level: string;
  levelId: string | null;
  maharoh: string;
  maharohId: string | null;
  weight: number;
  contentHtml: string;
  options: { label: string; html: string; plain: string }[];
  keyLetter: string;
  explanationHtml: string;
  status: string;
  errors: string[];
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
  const [search, setSearch] = useState("");
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

  // Impor Excel
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[] | null>(
    null
  );
  const [previewError, setPreviewError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bank-soal");
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
  }, []);

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

  async function handlePreviewUpload() {
    if (!importFile) return;
    setImporting(true);
    setPreviewError("");
    setImportResult("");
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await fetch("/api/admin/bank-soal/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error || "Gagal membaca file Excel");
        setPreviewRows(null);
        return;
      }
      setPreviewRows(data.rows || []);
    } finally {
      setImporting(false);
    }
  }

  async function handleConfirmImport() {
    if (!previewRows) return;
    setImporting(true);
    try {
      const res = await fetch("/api/admin/bank-soal/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: previewRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Gagal mengimpor soal");
        return;
      }
      const skippedText =
        data.skipped?.length > 0
          ? `, dilewati ${data.skipped.length}`
          : "";
      setImportResult(
        `Impor selesai: ${data.created} soal dibuat${skippedText}.`
      );
      setPreviewRows(null);
      setImportFile(null);
      await loadData();
    } finally {
      setImporting(false);
    }
  }

  const filteredQuestions = questions.filter((q) => {
    const matchLevel = !filterLevel || q.levelId === filterLevel;
    const matchMaharoh = !filterMaharoh || q.maharohId === filterMaharoh;
    const matchSearch =
      !search.trim() ||
      q.content.toLowerCase().includes(search.toLowerCase()) ||
      q.level?.name.toLowerCase().includes(search.toLowerCase()) ||
      q.maharoh?.name.toLowerCase().includes(search.toLowerCase());
    return matchLevel && matchMaharoh && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900">
            Bank Soal TOAFL
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Kelola soal pilihan ganda per level &times; maharoh beserta opsi
            dan bobot nilainya. Opsi bisa teks atau audio; soal audio
            (Istima') diunggah sebagai file. Arah tulisan (RTL/LTR)
            menyesuaikan isi teks secara otomatis — sama seperti yang dilihat
            peserta di halaman ujian.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Soal Baru</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari teks soal, level, atau maharoh..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 text-sm outline-none focus:border-yellow-500"
          />
        </div>
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          className="px-4 py-2 rounded-xl border border-zinc-200 text-sm bg-white outline-none focus:border-yellow-500"
        >
          <option value="">Semua Level ({questions.length})</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={filterMaharoh}
          onChange={(e) => setFilterMaharoh(e.target.value)}
          className="px-4 py-2 rounded-xl border border-zinc-200 text-sm bg-white outline-none focus:border-yellow-500"
        >
          <option value="">Semua Maharoh</option>
          {maharohs.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Impor Soal dari Excel */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 space-y-4 shadow-xs">
        <div>
          <h2 className="text-sm font-extrabold text-zinc-900">
            Impor Soal dari Excel
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kolom: Level | Maharoh | Bobot | Soal | Opsi A | Opsi B | Opsi
            C | Opsi D | Kunci | Pembahasan. Level dan Maharoh harus sama
            persis dengan nama di menu Level TOAFL dan Maharoh. Format
            tebal, garis bawah, dan miring pada sel ikut terimpor; karakter
            liar dibersihkan otomatis dan harakat dipertahankan. Audio soal
            tidak bisa diimpor — tambahkan lewat Tambah/Edit Soal.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href="/api/admin/bank-soal/import-template"
            className="px-4 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-semibold text-center cursor-pointer"
          >
            Unduh Template Excel
          </a>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setImportFile(e.target.files?.[0] || null);
              setPreviewRows(null);
              setPreviewError("");
            }}
            className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-xs"
          />
          <button
            onClick={handlePreviewUpload}
            disabled={!importFile || importing}
            className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
          >
            {importing ? "Memproses..." : "Pratinjau Impor"}
          </button>
        </div>

        {previewError && (
          <p className="text-xs font-bold text-red-600">{previewError}</p>
        )}
        {importResult && (
          <p className="text-xs font-bold text-emerald-700">{importResult}</p>
        )}

        {previewRows && (
          <div className="space-y-3">
            <div className="overflow-x-auto border border-zinc-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 font-bold text-zinc-500">
                    <th className="p-2.5">Baris</th>
                    <th className="p-2.5">Soal</th>
                    <th className="p-2.5">Level</th>
                    <th className="p-2.5">Maharoh</th>
                    <th className="p-2.5">Bobot</th>
                    <th className="p-2.5">Kunci</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {previewRows.map((r, i) => (
                    <tr key={i}>
                      <td className="p-2.5">{r.index}</td>
                      <td className="p-2.5 max-w-100" dir={getTextDirection(r.contentHtml) === "RTL" ? "rtl" : "ltr"}>
                        {renderRichText(r.contentHtml)}
                      </td>
                      <td className="p-2.5">{r.level || "-"}</td>
                      <td className="p-2.5">{r.maharoh || "-"}</td>
                      <td className="p-2.5">{r.weight}</td>
                      <td className="p-2.5">{r.keyLetter}</td>
                      <td className="p-2.5">
                        {r.status === "valid" ? (
                          "Valid"
                        ) : (
                          <span className="text-red-600 font-bold">
                            {r.errors.join("; ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreviewRows(null)}
                className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-700 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className="px-5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                {importing ? "Mengimpor..." : "Konfirmasi & Buat Soal"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Daftar Soal */}
      {loading ? (
        <div className="p-12 text-center text-sm text-zinc-500">
          Memuat bank soal...
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Belum ada soal pada filter ini. Klik &ldquo;Tambah Soal Baru&rdquo;
          atau impor dari Excel untuk membuat soal.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQuestions.map((q, idx) => (
            <div
              key={q.id}
              className="bg-white rounded-xl border border-zinc-200 p-5 sm:p-6 shadow-xs space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white font-bold text-xs">
                    #{idx + 1}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-yellow-50 border border-yellow-200 text-zinc-800 font-semibold text-xs">
                    {q.level?.name || "Tanpa Level"}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-yellow-50 border border-yellow-200 text-zinc-800 font-semibold text-xs">
                    {q.maharoh?.name || "Tanpa Maharoh"}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-900 font-bold text-xs">
                    Bobot: {q.weight} Poin
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 text-xs font-mono">
                    {getTextDirection(q.content)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(q)}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(q)}
                    className="px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                </div>
              </div>

              <div
                dir={getTextDirection(q.content) === "RTL" ? "rtl" : "ltr"}
                className={`p-4 rounded-xl bg-yellow-50/40 border border-yellow-200/60 text-zinc-900 whitespace-pre-line ${getTextDirection(q.content) === "RTL"
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
                {q.options.map((opt) => (
                  <div
                    key={opt.id}
                    className={`p-3 rounded-xl border flex items-center gap-3 ${opt.isCorrect
                      ? "bg-yellow-50 border-yellow-400 text-zinc-900"
                      : "bg-zinc-50/70 border-zinc-200 text-zinc-700"
                      }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ${opt.isCorrect
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-200 text-zinc-700"
                        }`}
                    >
                      {opt.label}
                    </span>
                    <span
                      dir={getTextDirection(opt.content) === "RTL" ? "rtl" : "ltr"}
                      className={`flex-1 ${getTextDirection(opt.content) === "RTL"
                        ? "font-arabic text-xl text-right"
                        : "text-xs sm:text-sm"
                        }`}
                    >
                      {opt.contentType === "AUDIO" && opt.audioUrl ? (
                        <audio controls src={opt.audioUrl} className="h-8 w-full" />
                      ) : (
                        renderRichText(opt.content)
                      )}
                    </span>
                    {opt.isCorrect && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              {q.explanation && (
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-600">
                  <span className="font-bold text-zinc-800">Pembahasan: </span>
                  {renderRichText(q.explanation)}
                </div>
              )}
            </div>
          ))}
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
