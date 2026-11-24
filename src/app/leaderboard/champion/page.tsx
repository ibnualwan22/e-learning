import LeaderboardClient from "./leaderboard-client";

// TOAFL Fase 6 — leaderboard publik TOAFL Champion.
// Next 16: searchParams adalah Promise — dibaca di server, lalu
// diteruskan ke komponen klien.
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ examId?: string }>;
}) {
  const { examId } = await searchParams;
  return <LeaderboardClient initialExamId={examId ?? ""} />;
}
