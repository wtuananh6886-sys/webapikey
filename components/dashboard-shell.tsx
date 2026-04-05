"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
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
import { dashboardPageTitle } from "@/lib/dashboard-page-meta";

const nav = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/dashboard/licenses", label: "License & key", icon: KeyRound },
  { href: "/dashboard/servers", label: "Máy chủ", icon: Server },
  { href: "/dashboard/tweaks", label: "Tweaks", icon: Package },
  { href: "/dashboard/users", label: "Người dùng", icon: Users },
  { href: "/dashboard/admins", label: "Chính sách", icon: ShieldUser },
  { href: "/dashboard/logs", label: "Nhật ký", icon: Telescope },
  { href: "/dashboard/settings", label: "Cài đặt", icon: Settings },
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
              className={`group relative flex min-h-11 touch-manipulation items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200 ease-out active:scale-[0.99] sm:min-h-0 ${
                active
                  ? "border-[var(--accent)]/40 bg-[var(--accent-subtle)] text-[var(--foreground)] shadow-[0_0_0_1px_rgba(232,192,120,0.2),0_0_24px_rgba(232,192,120,0.08),0_12px_32px_rgba(0,0,0,0.3)]"
                  : "border-transparent text-[var(--foreground-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] lg:hover:translate-x-0.5"
              }`}
            >
              {active ? (
                <span
                  className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-[var(--accent)]"
                  aria-hidden
                />
              ) : null}
              <Icon
                size={18}
                className={`shrink-0 transition-opacity ${active ? "text-[var(--accent)]" : "opacity-75 group-hover:opacity-100"}`}
                aria-hidden
              />
              <span className="truncate font-medium">{item.label}</span>
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
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
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
    <div className="nexora-frame relative mb-5 p-4">
      <div className="relative z-[1]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--teal)]">Tài khoản</p>
      <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2 sm:gap-x-3">
        <div className="min-w-0">
          <span className="text-[var(--foreground-muted)]">Email</span>
          <p className="truncate font-medium text-[var(--foreground-secondary)]">{email || "—"}</p>
        </div>
        <div className="min-w-0">
          <span className="text-[var(--foreground-muted)]">User</span>
          <p className="truncate font-medium text-[var(--foreground-secondary)]">{username || "—"}</p>
        </div>
      </div>
      {accountCreatedAt ? (
        <p className="mt-2 text-[11px] leading-snug text-[var(--foreground-muted)]">
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent-subtle)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
          {role}
        </span>
        <span className="text-[11px] text-[var(--foreground-muted)]">{currentPackage}</span>
      </div>
      {persistence ? (
        <p
          className={`mt-1 text-xs ${persistence.ok ? "text-emerald-400/90" : "text-amber-300/90"}`}
        >
          CSDL: {persistence.ok ? "Supabase OK" : "Mock / chưa sẵn sàng"}
        </p>
      ) : null}
      {policy && role !== "owner" ? (
        <>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            Package / tháng: {policy.packageTokensUsedThisMonth}/{policy.monthlyPackageTokenLimit}
          </p>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            Key / tháng: {policy.keysUsedThisMonth}/{policy.monthlyKeyLimit}
          </p>
          {policy.expiresAt ? (
            <p className="mt-1 text-xs text-amber-300/90">Hết hạn: {new Date(policy.expiresAt).toLocaleString("vi-VN")}</p>
          ) : null}
        </>
      ) : role === "owner" ? (
        <p className="mt-1 text-xs text-emerald-400/90">Owner không giới hạn quota.</p>
      ) : (
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">Chưa có policy — đăng nhập lại hoặc liên hệ admin.</p>
      )}
      </div>
    </div>
  );

  const brandBlock = (
    <div className="nexora-frame relative mb-6 p-4">
      <div className="relative z-[1] flex items-center gap-3">
        <span className="nexora-mark grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold">N</span>
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight text-[var(--foreground)]">Nexora-API</p>
          <p className="text-[11px] text-[var(--foreground-muted)]">Console vận hành</p>
        </div>
      </div>
    </div>
  );

  const footerBlock = (
    <div className="mt-6 space-y-2 border-t border-[var(--border-subtle)] pt-4">
      <a
        href="https://t.me/wtuananh6886"
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2.5 text-xs font-medium text-[var(--accent)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-subtle)]"
      >
        <Send size={14} aria-hidden />
        Telegram hỗ trợ
      </a>
      <p className="text-center text-[10px] text-[var(--foreground-muted)]">© Nexora-API · tuananh</p>
    </div>
  );

  const pageMeta = dashboardPageTitle(pathname);

  return (
    <div className="flex min-h-screen min-h-[100dvh]">
      <aside className="hidden h-[100dvh] w-[min(100%,17.5rem)] shrink-0 overflow-y-auto overscroll-contain border-r border-[var(--border-default)] bg-[var(--surface-panel)]/96 p-4 pt-[max(1.25rem,env(safe-area-inset-top))] backdrop-blur-xl lg:block xl:w-[18.5rem]">
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
          <div className="mobile-nav-panel absolute left-0 top-0 flex h-full w-[min(100vw-1.25rem,19rem)] flex-col border-r border-[var(--border-default)] bg-[var(--surface-panel)]/98 p-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--foreground)]">Menu</span>
              <button
                type="button"
                onClick={closeMobileNav}
                className="min-h-11 min-w-11 touch-manipulation rounded-xl border border-[var(--border-default)] p-2 text-[var(--foreground-secondary)] transition hover:bg-[var(--surface-hover)] active:scale-95"
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
        <header className="sticky top-[max(0.25rem,env(safe-area-inset-top))] z-30 mb-4 flex shrink-0 items-center gap-3 rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--surface-panel)]/85 px-3 py-3 shadow-[var(--shadow-soft)] backdrop-blur-md sm:px-4">
          <button
            type="button"
            className="min-h-11 min-w-11 touch-manipulation rounded-xl border border-[var(--border-default)] p-2.5 text-[var(--foreground-secondary)] transition hover:bg-[var(--surface-hover)] active:scale-95 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--teal)]">{pageMeta.eyebrow}</p>
            <p className="font-display truncate text-base tracking-tight text-[var(--foreground)] sm:text-lg">{pageMeta.title}</p>
            {(email || username) && (
              <p className="mt-0.5 truncate text-[11px] text-[var(--foreground-muted)] sm:text-xs lg:hidden">
                <span className="text-[var(--foreground-secondary)]">{username}</span>
                {email ? <span className="text-[var(--border-strong)]"> · </span> : null}
                <span>{email}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={logout}
              className="min-h-10 min-w-10 touch-manipulation rounded-xl border border-[var(--border-default)] p-2 text-[var(--foreground-secondary)] transition hover:border-red-500/35 hover:bg-red-950/35 hover:text-red-200 active:scale-95"
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
