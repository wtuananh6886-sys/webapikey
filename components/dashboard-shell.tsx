"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  X,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/licenses", label: "Licenses", icon: KeyRound },
  { href: "/dashboard/servers", label: "Servers", icon: Server },
  { href: "/dashboard/tweaks", label: "Tweaks", icon: Package },
  { href: "/dashboard/admins", label: "Admins", icon: ShieldUser },
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

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-2">
      {nav.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition active:bg-slate-800/80 ${
              active ? "border-blue-400 bg-blue-500/15 text-blue-200" : "border-transparent hover:border-slate-700 hover:bg-[#121c2e]"
            }`}
          >
            <Icon size={16} className="shrink-0" />
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
  const [role, setRole] = useState("viewer");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [policy, setPolicy] = useState<MePolicy | null>(null);
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
      };
      if (body.role) setRole(body.role);
      if (body.email) setEmail(body.email);
      if (body.username) setUsername(body.username);
      if (body.policy) setPolicy(body.policy);
    };
    void loadMe();
  }, []);

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
    if (policy?.assignedPlan) return `${policy.assignedPlan} plan`;
    if (role === "owner" || role === "admin") return "Premium Admin Suite";
    if (role === "support") return "Support Control";
    return "Viewer Readonly";
  }, [role, policy?.assignedPlan]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const accountBlock = (
    <div className="mb-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3">
      <p className="text-[11px] uppercase tracking-wide text-cyan-300/80">Signed in as</p>
      <p className="mt-1 break-all text-xs text-slate-300">
        <span className="font-medium text-slate-200">Email:</span> {email || "—"}
      </p>
      <p className="mt-1 break-all text-xs text-slate-300">
        <span className="font-medium text-slate-200">Username:</span> {username || "—"}
      </p>
      <p className="mt-2 text-sm font-semibold text-white">{role.toUpperCase()}</p>
      <p className="mt-1 text-xs text-slate-300">Plan: {currentPackage}</p>
      {policy && role !== "owner" && role !== "admin" ? (
        <>
          <p className="mt-1 text-xs text-slate-400">
            Packages / mo: {policy.packageTokensUsedThisMonth}/{policy.monthlyPackageTokenLimit}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Keys / mo: {policy.keysUsedThisMonth}/{policy.monthlyKeyLimit}
          </p>
          {policy.expiresAt ? (
            <p className="mt-1 text-xs text-amber-200/90">Until: {new Date(policy.expiresAt).toLocaleString()}</p>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-400">Full access for this role.</p>
      )}
    </div>
  );

  const brandBlock = (
    <div className="mb-8 rounded-2xl border bg-[#111a2a] p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cyan-500/20 text-sm font-bold text-cyan-300">A</div>
        <p className="text-xs text-slate-400">WebAPIKey</p>
      </div>
      <p className="text-lg font-semibold">Admin Console</p>
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
      <aside className="hidden w-72 shrink-0 border-r bg-[#0a111d]/90 p-5 lg:block">
        {brandBlock}
        {accountBlock}
        <NavLinks pathname={pathname} />
        {footerBlock}
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeMobileNav}
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 flex h-full w-[min(100vw-2.5rem,18rem)] flex-col border-r border-slate-800 bg-[#0a111d] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Menu</span>
              <button
                type="button"
                onClick={closeMobileNav}
                className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {brandBlock}
              {accountBlock}
              <NavLinks pathname={pathname} onNavigate={closeMobileNav} />
              {footerBlock}
            </div>
          </div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col p-3 sm:p-4 lg:p-7">
        <header className="mb-4 flex shrink-0 items-center gap-3 rounded-2xl border bg-[#0e1624]/90 px-3 py-3 sm:px-4">
          <button
            type="button"
            className="rounded-lg border border-slate-700 p-2 text-slate-200 hover:bg-slate-800/80 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-400">Premium control panel</p>
            <p className="truncate text-sm font-medium sm:text-base">Operational center</p>
            {(email || username) && (
              <p className="mt-1 truncate text-[11px] text-slate-500 sm:text-xs">
                <span className="text-slate-400">{username}</span>
                {email ? <span className="text-slate-600"> · </span> : null}
                <span className="text-slate-500">{email}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button type="button" className="rounded-lg border border-slate-700 p-2 hover:bg-slate-800/80" aria-label="Notifications">
              <Bell size={16} />
            </button>
            <button type="button" onClick={logout} className="rounded-lg border border-slate-700 p-2 hover:bg-slate-800/80" aria-label="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <div className="min-w-0 flex-1 overflow-x-auto pb-[env(safe-area-inset-bottom)]">{children}</div>
      </main>
    </div>
  );
}
