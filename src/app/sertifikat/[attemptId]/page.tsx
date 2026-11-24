"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Award, Printer } from "lucide-react";

// TOAFL Fase 6 — sertifikat Champion.
// Sertifikat hanya terbit setelah pengumuman resmi: exam
// certificateReleased harus true (diatur admin dari halaman Exam).
// Nama diambil dari akun peserta (tanpa edit nama pada tahap ini).
function getPredikat(persen: number) {
  if (persen >= 90) return { indo: "Imtiyaz", arab: "الامتياز" };
  if (persen >= 80) return { indo: "Jayyid Jiddan", arab: "جيد جدا" };
  if (persen >= 70) return { indo: "Jayyid", arab: "جيد" };
  return { indo: "Maqbul", arab: "مقبول" };
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
  totalMax: number;
  cumulative: number;
}

export default function SertifikatPage({
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
          setError(d.error || "Gagal memuat sertifikat");
          return;
        }
        if (d.exam.mode !== "CHAMPION") {
          setError("Sertifikat hanya tersedia untuk TOAFL Champion.");
          return;
        }
        if (!d.exam.certificateReleased) {
          setError("Sertifikat belum diumumkan. Silakan kembali setelah pengumuman resmi.");
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
          Memuat sertifikat...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 p-8 text-center space-y-4">
          <Award className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-sm font-semibold text-zinc-900">
            {error || "Sertifikat tidak ditemukan"}
          </p>
          <button
            onClick={() => router.push(`/hasil/${attemptId}`)}
            className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold cursor-pointer"
          >
            Kembali ke Hasil
          </button>
        </div>
      </div>
    );
  }

  // Nilai akumulatif sudah skala 0–100 (rata-rata nilai maharoh).
  const totalPercent = data.cumulative;
  const predikat = getPredikat(totalPercent);
  const tanggal = data.attempt.finishedAt
    ? new Date(data.attempt.finishedAt).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <div className="min-h-screen bg-zinc-100 py-8 px-4">
      <style>{`@media print { body { background: white !important; } .sertifikat-kartu { box-shadow: none !important; } }`}</style>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <button
            onClick={() => router.push(`/hasil/${attemptId}`)}
            className="px-4 py-2.5 rounded-xl bg-white border border-zinc-200 text-zinc-700 text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Hasil
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Cetak / Simpan PDF
          </button>
        </div>

        <div className="sertifikat-kartu bg-white rounded-xl shadow-xl border border-zinc-200 p-2 sm:p-3">
          <div className="border-[3px] border-amber-600 rounded-lg px-6 py-10 sm:px-12 sm:py-14 text-center space-y-5">
            <div>
              <p dir="rtl" className="font-arabic text-4xl sm:text-5xl text-amber-700 leading-snug">
                شهادة
              </p>
              <h1 className="text-2xl sm:text-3xl font-black tracking-[0.2em] text-zinc-900 mt-2">
                SERTIFIKAT
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1">
                TOAFL Champion • Markaz Arabiyah
              </p>
            </div>

            <p className="text-sm text-zinc-600">Diberikan kepada</p>
            <p className="text-3xl sm:text-4xl font-black text-zinc-900">
              {data.attempt.userName}
            </p>

            <p className="text-sm text-zinc-600 max-w-xl mx-auto">
              atas pencapaiannya dalam{" "}
              <strong className="text-zinc-900">{data.exam.title}</strong>{" "}
              — Level {data.exam.levelName}
            </p>

            <div className="max-w-md mx-auto bg-amber-50 border border-amber-200 rounded-xl px-6 py-4">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Nilai Akhir
              </div>
              <div className="text-4xl font-black text-zinc-900 mt-1">
                {data.cumulative}
                <span className="text-lg font-bold text-zinc-400">
                  {" "}
                  / 100
                </span>
              </div>
              <div className="mt-2">
                <span
                  dir="rtl"
                  className="font-arabic text-xl text-amber-800"
                >
                  {predikat.arab}
                </span>
                <span className="text-sm font-bold text-zinc-900">
                  {" "}
                  • {predikat.indo} ({totalPercent}%)
                </span>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-600 max-w-lg mx-auto">
              <div className="text-center sm:text-left">
                <p>Pare, Kediri</p>
                <p>{tanggal}</p>
              </div>
              <div className="text-center sm:text-right">
                <p className="font-bold text-zinc-900">Markaz Arabiyah</p>
                <p>E-learning Markaz Arabiyah</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
