import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Amiri } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "E-learning Markaz Arabiyah — Ujian TOAFL (Simulasi & Champion)",
  description:
    "Platform ujian TOAFL berbasis komputer (CBT) Markaz Arabiyah: Simulasi dan TOAFL Champion, dengan maharoh Istima', Qawa'id, dan Qira'ah, dukungan teks Arab RTL, dan penilaian otomatis.",
  icons: {
    icon: "/logo-markaz-emblem.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${jakarta.variable} ${amiri.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        {children}
      </body>
    </html>
  );
}
