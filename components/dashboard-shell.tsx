"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell, KeyRound, LayoutDashboard, LogOut, Package, Send, Server, Settings, ShieldUser, Telescope } from "lucide-react";

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

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState("viewer");
  const [policy, setPolicy] = useState<MePolicy | null>(null);

  useEffect(() => {
    const loadMe = async () => {
      const res = await fetch("/api/auth/me", { method: "GET" });
      if (!res.ok) return;
      const body = (await res.json()) as { role?: string; policy?: MePolicy | null };
      if (body.role) setRole(body.role);
      if (body.policy) setPolicy(body.policy);
    };
    void loadMe();
  }, []);

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

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-72 border-r bg-[#0a111d]/90 p-5 lg:block">
        <div className="mb-8 rounded-2xl border bg-[#111a2a] p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-500/20 text-sm font-bold text-cyan-300">A</div>
            <p className="text-xs text-slate-400">WebAPIKey</p>
          </div>
          <p className="text-lg font-semibold">Admin Console</p>
        </div>
        <div className="mb-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cyan-300/80">Current account</p>
          <p className="mt-1 text-sm font-semibold text-white">{role.toUpperCase()}</p>
          <p className="mt-1 text-xs text-slate-300">Assigned plan: {currentPackage}</p>
          {policy && role !== "owner" && role !== "admin" ? (
            <>
              <p className="mt-1 text-xs text-slate-400">
                Packages this month: {policy.packageTokensUsedThisMonth}/{policy.monthlyPackageTokenLimit}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Keys this month: {policy.keysUsedThisMonth}/{policy.monthlyKeyLimit}
              </p>
              {policy.expiresAt ? (
                <p className="mt-1 text-xs text-amber-200/90">Access until: {new Date(policy.expiresAt).toLocaleString()}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Full dashboard access for this role.</p>
          )}
        </div>
        <nav className="space-y-2">
          {nav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                  active ? "border-blue-400 bg-blue-500/15 text-blue-200" : "border-transparent hover:border-slate-700 hover:bg-[#121c2e]"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 rounded-xl border border-slate-800 bg-[#0b1320] px-3 py-2 text-[11px] text-slate-400">
          Licensed to <span className="font-semibold text-cyan-300">tuananh</span>
        </div>
        <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cyan-300/80">Admin info</p>
          <p className="mt-1 text-sm font-semibold text-white">tuananh</p>
          <p className="mt-1 text-xs text-slate-300">Telegram: @wtuananh6886</p>
          <a
            href="https://t.me/wtuananh6886"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 px-2 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/10"
          >
            <Send size={12} />
            Contact admin
          </a>
        </div>
      </aside>
      <main className="flex-1 p-4 lg:p-7">
        <header className="mb-5 flex items-center justify-between rounded-2xl border bg-[#0e1624]/90 px-4 py-3">
          <div>
            <p className="text-xs text-slate-400">Premium control panel</p>
            <p className="font-medium">Operational center</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border p-2"><Bell size={16} /></button>
            <button onClick={logout} className="rounded-lg border p-2"><LogOut size={16} /></button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
