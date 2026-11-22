"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ExternalLink } from "lucide-react";

interface RegistrationRecord {
  id: string;
  mode: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  paymentProofUrl: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    name: string;
    institution: string | null;
    email: string | null;
    whatsapp: string | null;
  };
  level: { id: string; name: string };
}

const TABS = [
  { key: "PENDING", label: "Menunggu" },
  { key: "VERIFIED", label: "Disetujui" },
  { key: "REJECTED", label: "Ditolak" },
  { key: "ALL", label: "Semua" },
] as const;

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminVerifikasiPage() {
  const router = useRouter();
  const [tab, setTab] = useState<string>("PENDING");
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<RegistrationRecord | null>(
    null
  );
  const [reason, setReason] = useState("");

  async function loadData(activeTab: string) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/verifikasi?status=${encodeURIComponent(activeTab)}`
      );
      if (res.status === 403 || res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setRegistrations(data.registrations || []);
      const nextCounts: Record<string, number> = {};
      for (const row of data.counts || []) {
        nextCounts[row.status] = row._count?._all ?? 0;
      }
      setCounts(nextCounts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleVerify(reg: RegistrationRecord) {
    if (!confirm(`Setujui pendaftaran ${reg.user.name} (${reg.user.username})?`))
      return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/verifikasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reg.id, action: "verify" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyetujui pendaftaran");
        return;
      }
      await loadData(tab);
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!reason.trim()) {
      setError("Alasan penolakan wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/verifikasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rejectTarget.id,
          action: "reject",
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menolak pendaftaran");
        return;
      }
      setRejectTarget(null);
      setReason("");
      await loadData(tab);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900">
          Verifikasi Champion
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Pendaftar TOAFL Champion masuk sebagai PENDING. Periksa data +
          bukti bayar, lalu Setujui atau Tolak beserta alasan. Yang ditolak
          harus daftar ulang dari awal (tidak ada jalur upload ulang).
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
              tab === t.key
                ? "bg-yellow-600 text-white"
                : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {t.label}
            {t.key !== "ALL" && (counts[t.key] ?? 0) > 0
              ? ` (${counts[t.key]})`
              : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
          Memuat data pendaftaran...
        </div>
      ) : registrations.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
          {tab === "PENDING"
            ? "Tidak ada pendaftaran Champion yang menunggu verifikasi."
            : "Tidak ada pendaftaran pada tab ini."}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-4 py-3 font-semibold">Pendaftar</th>
                <th className="px-4 py-3 font-semibold">Level</th>
                <th className="px-4 py-3 font-semibold">Kontak</th>
                <th className="px-4 py-3 font-semibold">Bukti Bayar</th>
                <th className="px-4 py-3 font-semibold">Daftar</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((reg) => (
                <tr
                  key={reg.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 align-top"
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-900">
                      {reg.user.name}
                    </div>
                    <div className="text-xs text-zinc-500">
                      @{reg.user.username}
                      {reg.user.institution
                        ? ` • ${reg.user.institution}`
                        : ""}
                    </div>
                    {reg.status === "REJECTED" && reg.rejectionReason && (
                      <div className="text-xs text-red-600 mt-1">
                        Alasan: {reg.rejectionReason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {reg.level.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 text-xs">
                    <div>{reg.user.email || "-"}</div>
                    <div>{reg.user.whatsapp || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    {reg.paymentProofUrl ? (
                      <a
                        href={`/api/admin/verifikasi/bukti/${reg.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-yellow-700 hover:text-yellow-800"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Lihat bukti
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
                    {formatDate(reg.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                        reg.status === "VERIFIED"
                          ? "bg-green-100 text-green-800"
                          : reg.status === "REJECTED"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {reg.status === "VERIFIED"
                        ? "Disetujui"
                        : reg.status === "REJECTED"
                          ? "Ditolak"
                          : "Menunggu"}
                    </span>
                    {reg.status !== "PENDING" && (
                      <div className="text-xs text-zinc-500 mt-1">
                        oleh {reg.verifiedBy || "-"}
                        <br />
                        {formatDate(reg.verifiedAt)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {reg.status === "PENDING" ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleVerify(reg)}
                          disabled={saving}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Setujui
                        </button>
                        <button
                          onClick={() => {
                            setRejectTarget(reg);
                            setReason("");
                            setError("");
                          }}
                          disabled={saving}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          Tolak
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/60"
            onClick={() => setRejectTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-900">
              Tolak Pendaftaran
            </h2>
            <p className="text-sm text-zinc-600">
              Menolak <strong>{rejectTarget.user.name}</strong> (@
              {rejectTarget.user.username}). Pendaftar harus daftar ulang dari
              awal bila ingin ikut lagi.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Alasan Penolakan (wajib)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="mis. Bukti pembayaran tidak terbaca"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleReject}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition cursor-pointer disabled:opacity-50"
              >
                {saving ? "Memproses..." : "Tolak Pendaftaran"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
