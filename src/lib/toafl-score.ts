// Penilaian TOAFL — fungsi murni (tanpa Prisma), boleh diimpor komponen
// klien maupun server.
//
// Keputusan user 24 Nov 2026: tiap maharoh maksimal 100. Nilai maharoh =
// skor mentah (jumlah bobot jawaban benar) dibagi bobot maksimal maharoh
// itu, dikali 100. Nilai akumulatif = rata-rata nilai maharoh — tiap
// maharoh bobotnya sama (4 maharoh berarti masing-masing 25%). Predikat
// dihitung dari nilai akumulatif ini (tabel Siakad: >=90 Imtiyaz,
// >=80 Jayyid Jiddan, >=70 Jayyid, <70 Maqbul).
// Satu desimal (80, 82.5, 66.7). rawScore (jumlah bobot mentah) tetap
// disimpan terpisah di Attempt dan tidak dipakai untuk tampilan hasil.

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Nilai satu maharoh, skala 0–100. Maharoh tanpa soal (bobot maksimal 0)
// bernilai 0 dan tidak ikut rata-rata akumulatif.
export function normalizeSectionScore(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return round1((score / maxScore) * 100);
}

// Nilai akumulatif: rata-rata nilai maharoh yang punya soal.
export function cumulativeScore(
  sections: { score: number; maxScore: number }[]
): number {
  const vals = sections
    .filter((s) => s.maxScore > 0)
    .map((s) => normalizeSectionScore(s.score, s.maxScore));
  if (vals.length === 0) return 0;
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}
