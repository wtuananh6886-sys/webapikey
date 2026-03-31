import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionRole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const role = await getSessionRole();
  if (!role) redirect("/login");
  return <DashboardShell>{children}</DashboardShell>;
}
