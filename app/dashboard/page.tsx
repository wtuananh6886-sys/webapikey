"use client";

import { Activity, KeyRound, Package, Server, ShieldUser } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card } from "@/components/ui-kit";
import { licenses, logs, servers, tweaks, admins } from "@/lib/mock-data";

const chartData = [
  { d: "03-25", v: 12 },
  { d: "03-26", v: 18 },
  { d: "03-27", v: 15 },
  { d: "03-28", v: 23 },
  { d: "03-29", v: 20 },
  { d: "03-30", v: 29 },
  { d: "03-31", v: 25 },
];

export default function DashboardPage() {
  const stats = [
    { label: "Total Licenses", value: licenses.length, icon: KeyRound },
    { label: "Online Servers", value: servers.filter((s) => s.status === "online").length, icon: Server },
    { label: "Tweaks", value: tweaks.length, icon: Package },
    { label: "Active Admins", value: admins.filter((a) => a.status === "active").length, icon: ShieldUser },
  ];

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((it) => (
          <Card key={it.label}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-400">{it.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white sm:text-3xl">{it.value}</p>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] ring-1 ring-[var(--accent)]/20">
                <it.icon size={22} aria-hidden />
              </div>
            </div>
          </Card>
        ))}
      </section>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <p className="mb-1 text-sm font-semibold text-slate-200">License activations trend</p>
          <p className="mb-4 text-xs text-slate-500">Demo chart — kết nối dữ liệu thật khi cần</p>
          <div className="h-[min(16rem,50vw)] min-h-[14rem] sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#243249" />
                <XAxis dataKey="d" stroke="#7c8ca8" />
                <Tooltip />
                <Area type="monotone" dataKey="v" stroke="#6d8cff" fill="rgba(109,140,255,0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <p className="mb-3 text-sm font-medium">Recent activity</p>
          <div className="space-y-3">
            {logs.slice(0, 6).map((log) => (
              <div key={log.id} className="rounded-xl border bg-[#0b1220] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{log.action}</p>
                  <Activity size={14} className="text-slate-400" />
                </div>
                <p className="text-xs text-slate-400">{log.targetName}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
