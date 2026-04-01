"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Send,
  Server,
  Settings,
  ShieldUser,
  Telescope,
  Users,
  X,
} from "lucide-react";
import { roleMaySeeNavItem } from "@/lib/dashboard-path-policy";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/licenses", label: "Licenses", icon: KeyRound },
  { href: "/dashboard/servers", label: "Servers", icon: Server },
  { href: "/dashboard/tweaks", label: "Tweaks", icon: Package },
  { href: "/dashboard/users", label: "Users", icon: Users },
  { href: "/dashboard/admins", label: "Policies", icon: ShieldUser },
  { href: "/dashboard/logs", label: "Activity Logs", icon: Telescope },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

type MePolicy = {
  assignedPlan: string;
  monthlyPackageTokenLimit: number;
  monthlyKeyLimit: number;
  packageTokensUsedThisMonth: number;
  keysUsedThisMonth: number;
  expiresAt: string | null;
  usageMonth?: string;
};

type PersistenceHealth = {
  ok: boolean;
  mode: "supabase" | "mock";
  message: string;
  checks: { env: boolean; db: boolean; schema: boolean };
};

function NavLinks({
  pathname,
  onNavigate,
  role,
}: {
  pathname: string;
  onNavigate?: () => void;
  role: string;
}) {
  return (
    <nav className="space-y-2">
      {nav
        .filter((item) => roleMaySeeNavItem(role as "owner" | "admin" | "support" | "viewer", item.href))
        .map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex min-h-11 touch-manipulation items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200 ease-out active:scale-[0.99] active:bg-slate-800/80 sm:min-h-0 ${
                active
                  ? "border-blue-400/90 bg-blue-500/15 text-blue-100 shadow-[0_0_24px_rgba(59,130,246,0.14)]"
                  : "border-transparent text-slate-300 hover:border-slate-600/80 hover:bg-[#121c2e] hover:text-slate-100 lg:hover:translate-x-0.5"
              }`}
            >
              <Icon size={18} className="shrink-0 opacity-80 transition-opacity group-hover:opacity-100" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState("viewer");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [policy, setPolicy] = useState<MePolicy | null>(null);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<PersistenceHealth | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const loadMe = async () => {
      const res = await fetch("/api/auth/me", { method: "GET" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        role?: string;
        email?: string;
        username?: string;
        policy?: MePolicy | null;
        accountCreatedAt?: string | null;
      };
      if (body.role) setRole(body.role);
      if (body.email) setEmail(body.email);
      if (body.username) setUsername(body.username);
      if (body.policy) setPolicy(body.policy);
      setAccountCreatedAt(body.accountCreatedAt ?? null);
    };
    void loadMe();
  }, []);

  useEffect(() => {
    const loadPersistence = async () => {
      try {
        const res = await fetch("/api/health/persistence", { method: "GET", credentials: "same-origin" });
        if (!res.ok) return;
        const body = (await res.json()) as PersistenceHealth;
        setPersistence(body);
      } catch {
        setPersistence(null);
      }
    };
    void loadPersistence();
  }, []);

  useEffect(() => {
    if (searchParams.get("forbidden") !== "1") return;
    toast.error("Bạn không có quyền truy cập trang đó.");
    router.replace("/dashboard", { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const currentPackage = useMemo(() => {
    if (role === "owner") return "Owner — không giới hạn quota";
    if (policy?.assignedPlan) return `Gói ${policy.assignedPlan}`;
    if (role === "admin") return "Admin (theo gói được gán)";
    if (role === "support") return "Support";
    return "Viewer";
  }, [role, policy?.assignedPlan]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const accountBlock = (
    <div className="mb-4 rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 to-transparent p-3.5 shadow-inner shadow-black/10">
      <p className="text-[11px] uppercase tracking-wide text-cyan-300/80">Signed in as</p>
      <p className="mt-1 break-all text-xs text-slate-300">
        <span className="font-medium text-slate-200">Email:</span> {email || "—"}
      </p>
      <p className="mt-1 break-all text-xs text-slate-300">
        <span className="font-medium text-slate-200">Username:</span> {username || "—"}
      </p>
      {accountCreatedAt ? (
        <p className="mt-1 text-[11px] leading-snug text-slate-400">
          Tạo tài khoản:{" "}
          {new Date(accountCreatedAt).toLocaleString("vi-VN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}
      <p className="mt-2 text-sm font-semibold text-white">{role.toUpperCase()}</p>
      <p className="mt-1 text-xs text-slate-300">Plan: {currentPackage}</p>
      {persistence ? (
        <p
          className={`mt-1 text-xs ${
            persistence.ok ? "text-emerald-300/90" : "text-amber-200/90"
          }`}
        >
          Persistence: {persistence.ok ? "Supabase OK" : "Mock/Not Ready"}
        </p>
      ) : null}
      {policy && role !== "owner" ? (
        <>
          <p className="mt-1 text-xs text-slate-400">
            Gói package / tháng: {policy.packageTokensUsedThisMonth}/{policy.monthlyPackageTokenLimit}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Key / tháng: {policy.keysUsedThisMonth}/{policy.monthlyKeyLimit}
          </p>
          {policy.expiresAt ? (
            <p className="mt-1 text-xs text-amber-200/90">Until: {new Date(policy.expiresAt).toLocaleString()}</p>
          ) : null}
        </>
      ) : role === "owner" ? (
        <p className="mt-1 text-xs text-emerald-300/90">Quota không áp dụng cho owner.</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Chưa có policy — đăng nhập lại hoặc liên hệ admin.</p>
      )}
    </div>
  );

  const brandBlock = (
    <div className="mb-6 rounded-2xl border border-slate-700/60 bg-gradient-to-br from-[#141f33] to-[#0d1422] p-4 shadow-lg shadow-black/20">
      <div className="mb-2 flex items-center gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/25 to-blue-600/20 text-sm font-bold text-cyan-200 ring-1 ring-cyan-400/20">
          A
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">WebAPIKey</p>
          <p className="text-base font-semibold text-white">Admin Console</p>
        </div>
      </div>
    </div>
  );

  const footerBlock = (
    <>
      <div className="mt-6 rounded-xl border border-slate-800 bg-[#0b1320] px-3 py-2 text-[11px] text-slate-400">
        Licensed to <span className="font-semibold text-cyan-300">tuananh</span>
      </div>
      <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
        <p className="text-[11px] uppercase tracking-wide text-cyan-300/80">Support</p>
        <p className="mt-1 text-xs text-slate-300">Telegram: @wtuananh6886</p>
        <a
          href="https://t.me/wtuananh6886"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 px-2 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/10"
        >
          <Send size={12} />
          Contact
        </a>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen min-h-[100dvh]">
      <aside className="hidden h-[100dvh] w-[min(100%,18rem)] shrink-0 overflow-y-auto overscroll-contain border-r border-slate-800/80 bg-[#0a111d]/95 p-5 pt-[max(1.25rem,env(safe-area-inset-top))] backdrop-blur-xl lg:block xl:w-72">
        {brandBlock}
        {accountBlock}
        <NavLinks pathname={pathname} role={role} />
        {footerBlock}
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity"
            onClick={closeMobileNav}
            aria-label="Đóng menu"
          />
          <div className="mobile-nav-panel absolute left-0 top-0 flex h-full w-[min(100vw-1.25rem,19rem)] flex-col border-r border-slate-800/90 bg-[#0a111d]/98 p-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Menu</span>
              <button
                type="button"
                onClick={closeMobileNav}
                className="min-h-11 min-w-11 touch-manipulation rounded-xl border border-slate-600/80 p-2 text-slate-200 transition hover:bg-slate-800/90 active:scale-95"
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {brandBlock}
              {accountBlock}
              <NavLinks pathname={pathname} onNavigate={closeMobileNav} role={role} />
              {footerBlock}
            </div>
          </div>
        </div>
      ) : null}

      <main
        id="main-content"
        className="flex min-w-0 flex-1 flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 lg:px-8 lg:pt-2"
        tabIndex={-1}
      >
        <header className="sticky top-[max(0.25rem,env(safe-area-inset-top))] z-30 mb-4 flex shrink-0 items-center gap-3 rounded-2xl border border-slate-800/80 bg-[#0e1624]/75 px-3 py-3 shadow-lg shadow-black/20 backdrop-blur-md sm:px-4">
          <button
            type="button"
            className="min-h-11 min-w-11 touch-manipulation rounded-xl border border-slate-600/70 p-2.5 text-slate-200 transition hover:bg-slate-800/90 active:scale-95 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">Control panel</p>
            <p className="truncate text-sm font-semibold text-slate-100 sm:text-base">Trung tâm vận hành</p>
            {(email || username) && (
              <p className="mt-0.5 truncate text-[11px] text-slate-500 sm:text-xs">
                <span className="text-slate-400">{username}</span>
                {email ? <span className="text-slate-600"> · </span> : null}
                <span className="text-slate-500">{email}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              className="min-h-10 min-w-10 touch-manipulation rounded-xl border border-slate-600/70 p-2 text-slate-300 transition hover:bg-slate-800/90 active:scale-95"
              aria-label="Thông báo"
            >
              <Bell size={18} />
            </button>
            <button
              type="button"
              onClick={logout}
              className="min-h-10 min-w-10 touch-manipulation rounded-xl border border-slate-600/70 p-2 text-slate-300 transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-200 active:scale-95"
              aria-label="Đăng xuất"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <div className="dashboard-page-enter mx-auto min-w-0 w-full max-w-[1600px] flex-1 overflow-x-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
