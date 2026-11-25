"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X } from "lucide-react";

interface MaharohRecord {
  id: string;
  name: string;
  description: string | null;
  order: number;
  defaultMinutes: number;
  defaultAudioRepeats: number;
  isActive: boolean;
  _count: { questions: number };
}

export default function AdminMaharohPage() {
  const router = useRouter();
  const [maharohs, setMaharohs] = useState<MaharohRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState(0);
  const [defaultMinutes, setDefaultMinutes] = useState(45);
  const [defaultAudioRepeats, setDefaultAudioRepeats] = useState(2);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/maharohs");
      if (res.status === 403 || res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setMaharohs(data.maharohs || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreateModal() {
    setEditingId(null);
    setName("");
    setDescription("");
    setOrder(maharohs.length + 1);
    setDefaultMinutes(45);
    setDefaultAudioRepeats(2);
    setIsActive(true);
    setError("");
    setShowModal(true);
  }

  function openEditModal(maharoh: MaharohRecord) {
    setEditingId(maharoh.id);
    setName(maharoh.name);
    setDescription(maharoh.description || "");
    setOrder(maharoh.order);
    setDefaultMinutes(maharoh.defaultMinutes);
    setDefaultAudioRepeats(maharoh.defaultAudioRepeats);
    setIsActive(maharoh.isActive);
    setError("");
    setShowModal(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Nama maharoh wajib diisi");
      return;
    }
    if (defaultMinutes < 1) {
      setError("Menit default harus minimal 1");
      return;
    }
    if (defaultAudioRepeats < 0) {
      setError("Jumlah pengulangan audio tidak boleh negatif");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editingId
          ? `/api/admin/maharohs/${editingId}`
          : "/api/admin/maharohs",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            order,
            defaultMinutes,
            defaultAudioRepeats,
            isActive,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan maharoh");
        return;
      }
      setShowModal(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(maharoh: MaharohRecord) {
    if (!confirm(`Yakin ingin menghapus maharoh "${maharoh.name}"?`)) return;
    const res = await fetch(`/api/admin/maharohs/${maharoh.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Gagal menghapus maharoh");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900">
            Maharoh
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Daftar maharoh ujian beserta menit dan pengulangan audio
            defaultnya. Nilai ini dipakai saat admin membuat exam.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold flex items-center gap-2 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Tambah Maharoh
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
          Memuat data maharoh...
        </div>
      ) : maharohs.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
          Belum ada maharoh. Tambahkan maharoh pertama.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-4 py-3 font-semibold w-16">Urutan</th>
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">Deskripsi</th>
                <th className="px-4 py-3 font-semibold text-center">
                  Menit Default
                </th>
                <th className="px-4 py-3 font-semibold text-center">
                  Audio Default
                </th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-center">Soal</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {maharohs.map((maharoh) => (
                <tr
                  key={maharoh.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3 text-zinc-600">{maharoh.order}</td>
                  <td className="px-4 py-3 font-bold text-zinc-900">
                    {maharoh.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {maharoh.description
                      ? maharoh.description.length > 120
                        ? `${maharoh.description.slice(0, 120)}…`
                        : maharoh.description
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-600">
                    {maharoh.defaultMinutes} mnt
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-600">
                    {maharoh.defaultAudioRepeats}x
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                        maharoh.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {maharoh.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-600">
                    {maharoh._count.questions}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(maharoh)}
                        aria-label="Ubah maharoh"
                        className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(maharoh)}
                        aria-label="Hapus maharoh"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/60"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">
                {editingId ? "Ubah Maharoh" : "Tambah Maharoh"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Tutup"
                className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Nama Maharoh
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mis. Istima'"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Deskripsi
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="mis. Mendengarkan"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Urutan
                </label>
                <input
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Menit
                </label>
                <input
                  type="number"
                  min={1}
                  value={defaultMinutes}
                  onChange={(e) => setDefaultMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Audio (x)
                </label>
                <input
                  type="number"
                  min={0}
                  value={defaultAudioRepeats}
                  onChange={(e) =>
                    setDefaultAudioRepeats(Number(e.target.value))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 accent-yellow-600"
                />
                Aktif
              </label>
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
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
