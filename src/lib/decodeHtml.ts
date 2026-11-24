// Decode entitas HTML hasil copy-paste dari web/Word (mis. &quot; &amp; &nbsp;)
// menjadi karakter aslinya. Dipakai di dua tempat:
//  - impor Excel (src/lib/excel.ts): sebelum teks disimpan, supaya yang
//    tersimpan karakter asli, bukan sintaks entitas;
//  - tampilan (src/lib/safeHtml.tsx): pengaman untuk data lama yang masih
//    menyimpan sintaks entitas, supaya tidak tampil mentah di layar.
//
// SENGAJA TIDAK mendekode &lt; dan &gt; (dan numerik 60/62/38): keduanya
// bisa membentuk tag HTML bila teks itu dirender sebagai HTML. Tanda < >
// yang diketik langsung di Excel tetap aman karena disimpan sebagai teks
// polos dan React meng-escape-nya saat tampil.
//
// Bentuk terbalik (;quot& dsb) ikut didekode: teks Arab RTL membalik
// urutan karakter netral di sekitar huruf Latin, sehingga &quot; yang
// tertempel di tengah kalimat Arab bisa tersimpan/tampil sebagai ;quot&.
const NAMED: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: "&",
  nbsp: " ",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  divide: "÷",
  plusmn: "±",
  deg: "°",
  sect: "§",
  para: "¶",
  middot: "·",
  bull: "•",
  dagger: "†",
  Dagger: "‡",
  permil: "‰",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  curren: "¤",
  brvbar: "¦",
  uml: "¨",
  ordf: "ª",
  ordm: "º",
  iexcl: "¡",
  iquest: "¿",
  szlig: "ß",
};

function decodeOnce(s: string): string {
  let out = s;
  // Numerik desimal &#NN; dan heksadesimal &#xHH; — kecuali 38 (&),
  // 60 (<), 62 (>) yang sengaja tidak disentuh (alasan di atas).
  out = out.replace(/&#(\d+);/g, (_m, n: string) => {
    const code = Number(n);
    if (!Number.isFinite(code) || code === 0 || code === 38 || code === 60 || code === 62) return _m;
    try {
      return String.fromCodePoint(code);
    } catch {
      return _m;
    }
  });
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => {
    const code = parseInt(h, 16);
    if (!Number.isFinite(code) || code === 0 || code === 38 || code === 60 || code === 62) return _m;
    try {
      return String.fromCodePoint(code);
    } catch {
      return _m;
    }
  });
  // Bernama: &nama;
  out = out.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name: string) =>
    name in NAMED ? NAMED[name] : m
  );
  // Bentuk terbalik RTL: ;nama& dan ;#NN& / ;#xHH&
  out = out.replace(/;([a-zA-Z][a-zA-Z0-9]+)&/g, (m, name: string) =>
    name in NAMED ? NAMED[name] : m
  );
  out = out.replace(/;#(\d+)&/g, (_m, n: string) => {
    const code = Number(n);
    if (!Number.isFinite(code) || code === 0 || code === 38 || code === 60 || code === 62) return _m;
    try {
      return String.fromCodePoint(code);
    } catch {
      return _m;
    }
  });
  out = out.replace(/;#x([0-9a-fA-F]+)&/g, (_m, h: string) => {
    const code = parseInt(h, 16);
    if (!Number.isFinite(code) || code === 0 || code === 38 || code === 60 || code === 62) return _m;
    try {
      return String.fromCodePoint(code);
    } catch {
      return _m;
    }
  });
  return out;
}

// Ulang sampai stabil (maks 3x) supaya entitas ganda hasil copy-paste
// berlapis ikut bersih, mis. &amp;quot; -> &quot; -> ".
export function decodeHtmlEntities(s: string): string {
  if (!s) return s;
  let prev = s;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(prev);
    if (next === prev) return next;
    prev = next;
  }
  return prev;
}
