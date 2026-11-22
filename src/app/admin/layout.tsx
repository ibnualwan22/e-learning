"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  GraduationCap,
  Languages,
  BookOpen,
  Library,
  ClipboardList,
  CalendarClock,
  Activity,
  Users,
  ShieldCheck,
  UserCheck,
  LogOut,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/level", label: "Level TOAFL", icon: GraduationCap },
  { href: "/admin/maharoh", label: "Maharoh", icon: Languages },
  { href: "/admin/bank-soal", label: "Bank Soal TOAFL", icon: Library },
  { href: "/admin/exam", label: "Exam TOAFL", icon: ClipboardList },
  { href: "/admin/verifikasi", label: "Verifikasi Champion", icon: UserCheck },
  { href: "/admin/questions", label: "Bank Soal & Bobot", icon: BookOpen },
  { href: "/admin/sessions", label: "Manajemen Sesi & Token", icon: CalendarClock },
  { href: "/admin/monitoring", label: "Monitoring & Peringkat", icon: Activity },
  { href: "/admin/participants", label: "Daftar Peserta", icon: Users },
  { href: "/admin/users", label: "Manajemen User / Admin", icon: ShieldCheck },
];

function SidebarContent({
  pathname,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  onNavigate: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-zinc-200 flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-lg bg-yellow-600 text-white flex items-center justify-center font-black text-lg">
          T
        </span>
        <div className="min-w-0">
          <div className="font-bold text-sm tracking-tight text-zinc-900 truncate">
            E-learning Markaz Arabiyah
          </div>
          <div className="text-xs text-yellow-700">TOAFL • Panel Admin</div>
        </div>
      </div>

      <nav className="p-3 flex flex-col gap-1 flex-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition ${
                isActive
                  ? "bg-yellow-600 text-white font-bold"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-200 space-y-2">
        <Link
          href="/exam"
          onClick={onNavigate}
          className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium flex items-center justify-between transition"
        >
          <span>Lihat Portal Peserta</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
        <button
          onClick={onLogout}
          className="w-full px-3.5 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar dari Admin</span>
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-100 flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:block w-64 shrink-0 bg-white text-zinc-900 border-r border-zinc-200">
        <SidebarContent
          pathname={pathname}
          onNavigate={() => {}}
          onLogout={handleLogout}
        />
      </aside>

      {/* Drawer mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-zinc-950/60"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white text-zinc-900 shadow-2xl">
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Tutup menu"
              className="absolute top-4 right-4 p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      {/* Kolom utama */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Bar atas mobile */}
        <header className="lg:hidden sticky top-0 z-40 bg-white text-zinc-900 border-b border-zinc-200">
          <div className="px-4 h-14 flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Buka menu"
              className="p-2 -ml-2 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-8 w-8 shrink-0 rounded-lg bg-yellow-600 text-white flex items-center justify-center font-black">
                T
              </span>
              <div className="leading-tight min-w-0">
                <div className="font-bold text-sm truncate">
                  E-learning Markaz Arabiyah
                </div>
                <div className="text-xs text-yellow-700">TOAFL • Panel Admin</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
