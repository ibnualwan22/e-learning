"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import { renderRichText } from "@/lib/safeHtml";
import { getTextDirection } from "@/lib/text-direction";
import { useRouter } from "next/navigation";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Flag,
  Send,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Type,
  Volume2,
  Lock,
  Play,
} from "lucide-react";

interface OptionItem {
  id: string;
  label: string;
  content: string;
  direction: "RTL" | "LTR";
  contentType: "TEXT" | "AUDIO";
  audioUrl: string | null;
}

interface QuestionItem {
  id: string;
  content: string;
  direction: "RTL" | "LTR";
  weight: number;
  audioUrl: string | null;
  explanation: string | null;
  options: OptionItem[];
}

interface SectionInfo {
  id: string;
  maharohId: string;
  maharohName: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "TIME_UP";
  startedAt: string;
  expiresAt: string;
  finishedAt: string | null;
  score: number;
  questionCount: number;
}

interface MaharohInfo {
  id: string;
  name: string;
  orderIndex: number;
  minutes: number;
  questionCount: number;
  audioRepeats: number;
}

interface AttemptInfo {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "TIME_UP";
  startedAt: string | null;
  finishedAt: string | null;
  timeSpentSeconds: number | null;
  rawScore: number | null;
  finalScore: number | null;
  currentMaharohId: string | null;
}

interface AnswerState {
  selectedOptionId: string | null;
  isDoubtful: boolean;
  audioPlayCount: number;
}

// Cadangan jawaban di perangkat peserta (pelajaran dari ujian Usbu'i Siakad:
// jawaban yang gagal terkirim tidak boleh hilang saat tab ditutup).
interface LocalAnswerEntry {
  selectedOptionId: string | null;
  isDoubtful: boolean;
  saved: boolean;
  updatedAt: number;
}

const localAnswersKey = (attemptId: string) => `toafl-answers:${attemptId}`;

function readLocalAnswers(
  attemptId: string
): Record<string, LocalAnswerEntry> {
  try {
    const raw = window.localStorage.getItem(localAnswersKey(attemptId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, LocalAnswerEntry>;
  } catch {
    return {};
  }
}

function writeLocalAnswers(
  attemptId: string,
  data: Record<string, LocalAnswerEntry>
) {
  try {
    window.localStorage.setItem(localAnswersKey(attemptId), JSON.stringify(data));
  } catch {
    // Kuota penuh / mode privat: cadangan lokal dilewati, alur server tetap jalan.
  }
}

async function flushPendingForAttempt(attemptId: string): Promise<boolean> {
  const pending = Object.entries(readLocalAnswers(attemptId)).filter(
    ([, e]) => e && !e.saved
  );
  for (const [questionId, entry] of pending) {
    const current = readLocalAnswers(attemptId)[questionId];
    if (!current || current.saved || current.updatedAt !== entry.updatedAt) {
      continue;
    }
    try {
      const res = await fetch("/api/exam/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          questionId,
          selectedOptionId: entry.selectedOptionId,
          isDoubtful: entry.isDoubtful,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.timeUp) {
          window.location.reload();
          return false;
        }
        continue;
      }
      const after = readLocalAnswers(attemptId);
      const afterEntry = after[questionId];
      if (afterEntry && afterEntry.updatedAt === entry.updatedAt) {
        afterEntry.saved = true;
        writeLocalAnswers(attemptId, after);
      }
    } catch {
      continue;
    }
  }
  return !Object.values(readLocalAnswers(attemptId)).some(
    (e) => e && !e.saved
  );
}

// TOAFL Fase 4 — halaman ujian per maharoh. Folder tetap [sessionId]
// (warisan Olimpiade) tapi param-nya adalah ID Attempt TOAFL.
export default function ExamPlayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId: attemptId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [maharohs, setMaharohs] = useState<MaharohInfo[]>([]);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [currentMaharohName, setCurrentMaharohName] = useState("");
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [fontScale, setFontScale] = useState<"normal" | "large" | "xlarge">(
    "large"
  );
  const [savingStatus, setSavingStatus] = useState<
    "saved" | "saving" | "error"
  >("saved");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const autoSubmitRef = useRef(false);
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);
  const audioElsRef = useRef<Record<string, HTMLAudioElement>>({});

  const loadState = useCallback(
    async (silent: boolean) => {
      try {
        const res = await fetch(`/api/exam/state?attemptId=${attemptId}`);
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) {
          router.push("/exam");
          return;
        }
        const data = await res.json();
        setAttempt(data.attempt);
        setExamTitle(data.exam.title);
        setMaharohs(data.exam.maharohs || []);
        setSections(data.sections || []);

        const ansMap: Record<string, AnswerState> = {};
        for (const a of data.answers || []) {
          ansMap[a.questionId] = {
            selectedOptionId: a.selectedOptionId,
            isDoubtful: a.isDoubtful,
            audioPlayCount: a.audioPlayCount ?? 0,
          };
        }
        setAnswers(ansMap);

        if (data.attempt.status === "IN_PROGRESS" && data.currentSection) {
          const cs = data.currentSection;
          setCurrentSectionId(cs.id);
          setCurrentMaharohName(cs.maharohName);
          setQuestions(cs.questions || []);
          const serverNow = new Date(data.serverTime).getTime();
          const expiry = new Date(cs.expiresAt).getTime();
          setRemainingSeconds(
            Math.max(0, Math.floor((expiry - serverNow) / 1000))
          );
          setCurrentIdx(0);
        } else {
          setCurrentSectionId(null);
          setQuestions([]);
          setRemainingSeconds(null);
        }

        if (!silent && data.attempt.status === "IN_PROGRESS") {
          const local = readLocalAnswers(data.attempt.id);
          const pendingEntries = Object.entries(local).filter(
            ([, e]) => e && !e.saved
          );
          if (pendingEntries.length > 0) {
            setAnswers((prev) => {
              const merged = { ...prev };
              for (const [qid, e] of pendingEntries) {
                merged[qid] = {
                  selectedOptionId: e.selectedOptionId,
                  isDoubtful: e.isDoubtful,
                  audioPlayCount: merged[qid]?.audioPlayCount ?? 0,
                };
              }
              return merged;
            });
            void flushPendingForAttempt(data.attempt.id);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [attemptId, router]
  );

  useEffect(() => {
    void loadState(false);
  }, [loadState]);

  // Preload semua audio maharoh berjalan saat section dimuat, supaya
  // putaran pertama tidak macet.
  useEffect(() => {
    const urls = new Set<string>();
    for (const q of questions) {
      if (q.audioUrl) urls.add(q.audioUrl);
      for (const o of q.options) {
        if (o.audioUrl) urls.add(o.audioUrl);
      }
    }
    for (const url of urls) {
      if (!audioElsRef.current[url]) {
        const el = new Audio(url);
        el.preload = "auto";
        audioElsRef.current[url] = el;
      }
    }
  }, [questions, currentSectionId]);

  // Reset penanda waktu habis saat attempt/section berganti.
  useEffect(() => {
    autoSubmitRef.current = false;
    setIsTimeUp(false);
    setSubmitError(null);
  }, [attempt?.id, currentSectionId]);

  const handleSubmitSection = useCallback(async () => {
    if (submitting || !attempt) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/exam/submit-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attempt.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          data.error || "Gagal mengumpulkan maharoh. Coba lagi."
        );
        return;
      }
      setShowConfirmModal(false);
      try {
        window.localStorage.removeItem(localAnswersKey(attempt.id));
      } catch {
        // abaikan
      }
      setLoading(true);
      await loadState(false);
    } catch {
      setSubmitError("Gagal menghubungi server. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, attempt, loadState]);

  // Countdown timer maharoh berjalan (tampilan saja — penegakan di server).
  useEffect(() => {
    if (!attempt || attempt.status !== "IN_PROGRESS" || remainingSeconds === null) {
      return;
    }
    if (remainingSeconds <= 0) {
      setIsTimeUp(true);
      if (!autoSubmitRef.current) {
        autoSubmitRef.current = true;
        // Sekali saja, tanpa pengulangan otomatis.
        autoSubmitTimerRef.current = setTimeout(() => {
          void handleSubmitSection();
        }, 500);
      }
      return () => {
        if (autoSubmitTimerRef.current) {
          clearTimeout(autoSubmitTimerRef.current);
        }
      };
    }
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [attempt, remainingSeconds, handleSubmitSection]);

  // Sinkronisasi state berkala (30 detik) supaya penutupan otomatis
  // dari server (waktu habis) tercermin walau tab sempat tidak aktif.
  useEffect(() => {
    if (!attempt || attempt.status !== "IN_PROGRESS") return;
    const interval = setInterval(() => {
      void loadState(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [attempt, loadState]);

  // Kirim ulang jawaban tertunda: saat kembali online / tab terlihat.
  useEffect(() => {
    if (!attempt || attempt.status !== "IN_PROGRESS") return;
    const flush = () => {
      if (flushingRef.current) return;
      flushingRef.current = true;
      void flushPendingForAttempt(attempt.id)
        .then((allSent) => setSavingStatus(allSent ? "saved" : "error"))
        .finally(() => {
          flushingRef.current = false;
        });
    };
    const onOnline = () => flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(flush, 30000);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [attempt]);

  // Bersihkan cadangan lokal begitu attempt selesai.
  useEffect(() => {
    if (!attempt || attempt.status === "IN_PROGRESS") return;
    try {
      window.localStorage.removeItem(localAnswersKey(attempt.id));
    } catch {
      // abaikan
    }
  }, [attempt]);

  async function saveAnswerToServer(
    questionId: string,
    selectedOptionId: string | null,
    isDoubtful: boolean
  ) {
    if (!attempt || attempt.status !== "IN_PROGRESS") return;
    if (isTimeUp) return;

    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        selectedOptionId,
        isDoubtful,
        audioPlayCount: prev[questionId]?.audioPlayCount ?? 0,
      },
    }));
    setSavingStatus("saving");

    const now = Date.now();
    const local = readLocalAnswers(attempt.id);
    local[questionId] = {
      selectedOptionId,
      isDoubtful,
      saved: false,
      updatedAt: now,
    };
    writeLocalAnswers(attempt.id, local);

    try {
      const res = await fetch("/api/exam/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: attempt.id,
          questionId,
          selectedOptionId,
          isDoubtful,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.timeUp) {
          window.location.reload();
          return;
        }
        setSavingStatus("error");
        return;
      }

      const after = readLocalAnswers(attempt.id);
      const entry = after[questionId];
      if (
        entry &&
        entry.selectedOptionId === selectedOptionId &&
        entry.isDoubtful === isDoubtful &&
        entry.updatedAt <= now
      ) {
        entry.saved = true;
        writeLocalAnswers(attempt.id, after);
      }
      setSavingStatus("saved");
    } catch {
      setSavingStatus("error");
    }
  }

  // Audio: minta izin putar ke server DULU (server menghitung + menegakkan
  // batas). Baru bila diizinkan, putar dari awal tanpa seek (tanpa kontrol
  // bawaan browser, jadi tidak ada cara seek dari UI).
  async function playAudio(questionId: string, url: string) {
    if (!attempt || attempt.status !== "IN_PROGRESS") return;
    if (playingUrl) return;
    setAudioError(null);
    try {
      const res = await fetch("/api/exam/audio-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attempt.id, questionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.allowed) {
        setAnswers((prev) => ({
          ...prev,
          [questionId]: {
            selectedOptionId: prev[questionId]?.selectedOptionId ?? null,
            isDoubtful: prev[questionId]?.isDoubtful ?? false,
            audioPlayCount: data.count ?? prev[questionId]?.audioPlayCount ?? 0,
          },
        }));
        setAudioError(
          data.error || "Batas pengulangan audio sudah habis untuk soal ini."
        );
        return;
      }

      setAnswers((prev) => ({
        ...prev,
        [questionId]: {
          selectedOptionId: prev[questionId]?.selectedOptionId ?? null,
          isDoubtful: prev[questionId]?.isDoubtful ?? false,
          audioPlayCount: data.count,
        },
      }));

      const el = audioElsRef.current[url] ?? new Audio(url);
      audioElsRef.current[url] = el;
      el.currentTime = 0;
      setPlayingUrl(url);
      el.onended = () => setPlayingUrl(null);
      el.onerror = () => {
        setPlayingUrl(null);
        setAudioError("Audio gagal diputar. Periksa koneksi lalu coba lagi.");
      };
      await el.play();
    } catch {
      setPlayingUrl(null);
      setAudioError("Audio gagal diputar. Periksa koneksi lalu coba lagi.");
    }
  }

  function formatCountdown(sec: number | null) {
    if (sec === null) return "--:--";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(
        2,
        "0"
      )}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  if (loading || !attempt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-sm font-medium text-zinc-500 animate-pulse">
          Menyiapkan lembar soal ujian...
        </div>
      </div>
    );
  }

  // JIKA UJIAN SUDAH SELESAI -> RINGKASAN SKOR PER MAHAROH + TOTAL
  // (Pembahasan/kunci jawaban hadir di Fase 6.)
  if (attempt.status !== "IN_PROGRESS") {
    const mins = attempt.timeSpentSeconds
      ? Math.floor(attempt.timeSpentSeconds / 60)
      : 0;
    const secs = attempt.timeSpentSeconds ? attempt.timeSpentSeconds % 60 : 0;

    return (
      <div className="min-h-screen bg-zinc-100 py-10 px-4 flex items-center justify-center">
        <div className="max-w-xl w-full bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden">
          <div className="bg-zinc-900 text-white p-8 text-center">
            <div className="w-16 h-16 rounded-xl bg-zinc-800/80 border border-amber-400/40 flex items-center justify-center mx-auto mb-4 text-amber-300">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <p dir="rtl" className="font-arabic text-2xl text-amber-300 mb-1">
              الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ
            </p>
            <h1 className="text-2xl font-extrabold">
              Ujian Telah Diselesaikan!
            </h1>
            <p className="text-xs text-zinc-300 mt-1">{examTitle}</p>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">
                Total Nilai Akhir Anda
              </div>
              <div className="text-5xl font-black text-zinc-900">
                {attempt.finalScore}
              </div>
              <div className="text-xs text-amber-700 mt-2">
                Diselesaikan dalam waktu{" "}
                <strong>
                  {mins} menit {secs} detik
                </strong>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="font-bold text-sm text-zinc-900">
                Skor per Maharoh
              </h2>
              {sections.map((s) => (
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
                  <span className="font-black text-zinc-900">{s.score}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-zinc-500 text-center">
              Pembahasan soal (kunci + penjelasan) akan tampil di sini pada
              tahap berikutnya.
            </p>

            <button
              onClick={() => router.push("/exam")}
              className="w-full py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Portal Peserta</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIdx];
  const questionDirection = currentQuestion
    ? getTextDirection(currentQuestion.content)
    : "LTR";
  const currentAnswer = currentQuestion
    ? answers[currentQuestion.id] || {
        selectedOptionId: null,
        isDoubtful: false,
        audioPlayCount: 0,
      }
    : { selectedOptionId: null, isDoubtful: false, audioPlayCount: 0 };

  const answeredCount = questions.filter(
    (q) => answers[q.id]?.selectedOptionId
  ).length;
  const doubtfulCount = questions.filter(
    (q) => answers[q.id]?.isDoubtful
  ).length;

  const currentMaharoh = maharohs.find((m) => m.id === attempt.currentMaharohId);
  const audioLimit = currentMaharoh?.audioRepeats ?? 2;

  const arabicSizeClass =
    fontScale === "xlarge"
      ? "text-3xl sm:text-4xl"
      : fontScale === "large"
        ? "text-2xl sm:text-3xl"
        : "text-xl sm:text-2xl";

  const optionArabicSizeClass =
    fontScale === "xlarge"
      ? "text-2xl sm:text-3xl"
      : fontScale === "large"
        ? "text-xl sm:text-2xl"
        : "text-lg sm:text-xl";

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col">
      {/* Sticky Exam Top Bar */}
      <header className="sticky top-0 z-30 bg-zinc-900 text-white border-b border-zinc-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-bold text-sm sm:text-base truncate">
              {examTitle}
            </h1>
            <div className="flex items-center gap-3 text-xs text-amber-300">
              <span>
                Maharoh {currentMaharohName} — Soal {currentIdx + 1}/
                {questions.length}
              </span>
              <span>•</span>
              <span>
                Terjawab: {answeredCount}/{questions.length}
              </span>
              <span>•</span>
              <span>
                {savingStatus === "saving"
                  ? "Menyimpan..."
                  : savingStatus === "error"
                    ? "Gagal simpan, mencoba ulang otomatis"
                    : "Tersimpan otomatis"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`px-4 py-2 rounded-xl font-mono font-black text-base sm:text-lg flex items-center gap-2 border ${
                remainingSeconds !== null && remainingSeconds < 300
                  ? "bg-red-600 text-white border-red-400 animate-pulse"
                  : "bg-zinc-800/90 text-amber-300 border-amber-400/30"
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatCountdown(remainingSeconds)}</span>
            </div>

            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kumpulkan Maharoh</span>
              <span className="sm:hidden">Kumpulkan</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Question Card (Left 8/12) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {isTimeUp && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-2">
              <p className="font-bold text-sm text-red-800">
                Waktu maharoh ini habis. Jawaban Anda sudah tersimpan.
              </p>
              {submitError ? (
                <>
                  <p className="text-sm text-red-700">{submitError}</p>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleSubmitSection()}
                    className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs cursor-pointer"
                  >
                    {submitting ? "Mengumpulkan..." : "Lanjut ke Maharoh Berikut"}
                  </button>
                </>
              ) : (
                <p className="text-xs text-red-700">
                  Maharoh sedang ditutup otomatis. Bila halaman ini tidak
                  berubah, klik tombol Kumpulkan Maharoh di atas.
                </p>
              )}
            </div>
          )}
          {audioError && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              {audioError}
            </div>
          )}
          {currentQuestion ? (
            <div className="bg-white rounded-xl shadow-xs border border-zinc-200 overflow-hidden flex-1 flex flex-col justify-between">
              <div>
                {/* Question Header Bar */}
                <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="px-3 py-1 rounded-lg bg-zinc-900 text-white font-bold text-xs">
                      SOAL NO. {currentIdx + 1}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-xs">
                      Maharoh {currentMaharohName}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-xs">
                      Bobot: {currentQuestion.weight} Poin
                    </span>
                  </div>

                  {/* Font Size Adjuster */}
                  <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1">
                    <Type className="w-3.5 h-3.5 text-zinc-400 mx-1.5" />
                    <button
                      type="button"
                      onClick={() => setFontScale("normal")}
                      className={`px-2 py-0.5 rounded text-xs font-bold cursor-pointer ${
                        fontScale === "normal"
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      A-
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontScale("large")}
                      className={`px-2 py-0.5 rounded text-xs font-bold cursor-pointer ${
                        fontScale === "large"
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontScale("xlarge")}
                      className={`px-2 py-0.5 rounded text-xs font-bold cursor-pointer ${
                        fontScale === "xlarge"
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      A+
                    </button>
                  </div>
                </div>

                {/* Question Content */}
                <div className="p-6 sm:p-8">
                  <div
                    dir={questionDirection === "RTL" ? "rtl" : "ltr"}
                    className={`p-6 rounded-xl bg-amber-50/40 border border-amber-200/60 text-zinc-900 whitespace-pre-line ${
                      questionDirection === "RTL"
                        ? `font-arabic ${arabicSizeClass} text-right`
                        : "text-base sm:text-lg leading-relaxed"
                    }`}
                  >
                    {renderRichText(currentQuestion.content)}
                  </div>

                  {/* Audio soal (bila ada) */}
                  {currentQuestion.audioUrl && (
                    <div className="mt-4 flex items-center gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50">
                      <button
                        type="button"
                        disabled={
                          isTimeUp ||
                          playingUrl !== null ||
                          currentAnswer.audioPlayCount >= audioLimit
                        }
                        onClick={() =>
                          void playAudio(
                            currentQuestion.id,
                            currentQuestion.audioUrl as string
                          )
                        }
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                      >
                        {playingUrl === currentQuestion.audioUrl ? (
                          <>
                            <Volume2 className="w-4 h-4 animate-pulse" />
                            Memutar...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current" />
                            Putar Audio Soal
                          </>
                        )}
                      </button>
                      <span className="text-xs text-zinc-600">
                        Diputar {currentAnswer.audioPlayCount}/{audioLimit}x
                        (dari awal, tanpa seek)
                      </span>
                    </div>
                  )}

                  {/* Options List */}
                  <div className="mt-6 space-y-3">
                    {currentQuestion.options.map((opt) => {
                      const isSelected =
                        currentAnswer.selectedOptionId === opt.id;
                      return (
                        <div
                          key={opt.id}
                          className={`w-full p-4 rounded-xl border-2 transition flex items-center gap-4 text-left ${
                            isSelected
                              ? "border-amber-500 bg-amber-50/70 shadow-xs"
                              : "border-zinc-200 hover:border-amber-300 bg-white"
                          }`}
                        >
                          <button
                            type="button"
                            disabled={isTimeUp}
                            onClick={() =>
                              void saveAnswerToServer(
                                currentQuestion.id,
                                opt.id,
                                currentAnswer.isDoubtful
                              )
                            }
                            className="flex items-center gap-4 flex-1 text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <div
                              className={`w-9 h-9 rounded-xl font-bold text-sm flex items-center justify-center shrink-0 transition ${
                                isSelected
                                  ? "bg-zinc-900 text-white"
                                  : "bg-zinc-100 text-zinc-700"
                              }`}
                            >
                              {opt.label}
                            </div>

                            <div
                              dir={
                                getTextDirection(opt.content) === "RTL"
                                  ? "rtl"
                                  : "ltr"
                              }
                              className={`flex-1 ${
                                getTextDirection(opt.content) === "RTL"
                                  ? `font-arabic ${optionArabicSizeClass} text-right`
                                  : "text-sm sm:text-base text-zinc-800"
                              }`}
                            >
                              {opt.contentType === "AUDIO"
                                ? "Jawaban audio — dengarkan di samping"
                                : renderRichText(opt.content)}
                            </div>
                          </button>

                          {opt.contentType === "AUDIO" && opt.audioUrl && (
                            <button
                              type="button"
                              disabled={
                                isTimeUp ||
                                playingUrl !== null ||
                                currentAnswer.audioPlayCount >= audioLimit
                              }
                              onClick={() =>
                                void playAudio(
                                  currentQuestion.id,
                                  opt.audioUrl as string
                                )
                              }
                              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                            >
                              {playingUrl === opt.audioUrl ? (
                                <>
                                  <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                                  Memutar...
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Putar
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Navigation Controls */}
              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 disabled:opacity-40 text-zinc-700 font-semibold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Soal Sebelumnya</span>
                </button>

                <button
                  type="button"
                  disabled={isTimeUp}
                  onClick={() =>
                    void saveAnswerToServer(
                      currentQuestion.id,
                      currentAnswer.selectedOptionId,
                      !currentAnswer.isDoubtful
                    )
                  }
                  className={`px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-1.5 border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    currentAnswer.isDoubtful
                      ? "bg-amber-400 text-zinc-950 border-amber-500"
                      : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                  }`}
                >
                  <Flag className="w-4 h-4" />
                  <span>
                    {currentAnswer.isDoubtful
                      ? "Ditandai Ragu-ragu"
                      : "Ragu-ragu"}
                  </span>
                </button>

                {currentIdx < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))
                    }
                    className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Soal Selanjutnya</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Kumpulkan Maharoh</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-xs border border-zinc-200 p-8 text-center text-sm text-zinc-500">
              Memuat maharoh berikutnya...
            </div>
          )}
        </div>

        {/* Sidebar: daftar maharoh + navigasi nomor soal */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl shadow-xs border border-zinc-200 p-5">
            <h2 className="font-bold text-sm text-zinc-900 mb-3">
              Maharoh Ujian
            </h2>
            <div className="space-y-2">
              {maharohs.map((m) => {
                const sec = sections.find((s) => s.maharohId === m.id);
                const isCurrent = m.id === attempt.currentMaharohId && attempt.status === "IN_PROGRESS";
                const done = sec && sec.status !== "IN_PROGRESS";
                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${
                      isCurrent
                        ? "border-amber-500 bg-amber-50/70"
                        : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <span className="font-semibold text-zinc-800 flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : isCurrent ? (
                        <Clock className="w-4 h-4 text-amber-600" />
                      ) : (
                        <Lock className="w-4 h-4 text-zinc-400" />
                      )}
                      {m.name}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {done
                        ? `Skor ${sec.score}`
                        : isCurrent
                          ? "Berjalan"
                          : "Terkunci"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-zinc-200 p-5">
            <h2 className="font-bold text-sm text-zinc-900 mb-3">
              Navigasi Nomor Soal — {currentMaharohName}
            </h2>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const ans = answers[q.id];
                const isCurrent = idx === currentIdx;
                const isAnswered = Boolean(ans?.selectedOptionId);
                const isDoubt = Boolean(ans?.isDoubtful);

                let btnStyle =
                  "bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200";
                if (isDoubt) {
                  btnStyle = "bg-amber-400 text-zinc-950 border-amber-500";
                } else if (isAnswered) {
                  btnStyle = "bg-zinc-900 text-white border-zinc-800";
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-11 rounded-xl font-bold text-xs border-2 transition flex flex-col items-center justify-center cursor-pointer ${btnStyle} ${
                      isCurrent ? "ring-2 ring-offset-2 ring-amber-500" : ""
                    }`}
                  >
                    <span>{idx + 1}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-zinc-100 grid grid-cols-3 gap-2 text-xs text-zinc-600">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-zinc-900 inline-block" />
                <span>Terjawab ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
                <span>Ragu ({doubtfulCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-zinc-200 inline-block" />
                <span>Kosong ({questions.length - answeredCount})</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal Konfirmasi Kumpulkan Maharoh */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-7 h-7 shrink-0" />
              <h3 className="text-lg font-bold text-zinc-900">
                Kumpulkan Maharoh {currentMaharohName}?
              </h3>
            </div>

            <div className="text-sm text-zinc-600 space-y-2">
              <p>
                Anda telah menjawab{" "}
                <strong className="text-zinc-900">
                  {answeredCount} dari {questions.length} soal
                </strong>{" "}
                di maharoh ini.
              </p>
              {questions.length - answeredCount > 0 && (
                <p className="text-red-600 font-medium">
                  Masih ada {questions.length - answeredCount} soal yang belum
                  dijawab!
                </p>
              )}
              {doubtfulCount > 0 && (
                <p className="text-amber-700 font-medium">
                  Masih ada {doubtfulCount} soal yang ditandai Ragu-ragu.
                </p>
              )}
              <p className="text-xs text-zinc-500 pt-1">
                Setelah dikumpulkan, maharoh ini TERKUNCI dan Anda lanjut ke
                maharoh berikutnya. Jawaban tidak bisa diubah lagi.
              </p>
            </div>

            {submitError && (
              <p className="text-red-600 font-medium text-sm">{submitError}</p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-xs cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmitSection()}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs cursor-pointer"
              >
                {submitting ? "Mengumpulkan..." : "Ya, Kumpulkan Maharoh"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
