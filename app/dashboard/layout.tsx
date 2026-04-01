import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { getSessionRole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const role = await getSessionRole();
  if (!role) redirect("/login");
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a111d] text-sm text-slate-500">
          Đang tải…
        </div>
      }
    >
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
