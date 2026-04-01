import { cookies } from "next/headers";
import type { Role } from "@/types/domain";
import { parseRoleCookie } from "@/lib/dashboard-path-policy";

export type WaSession = { role: Role; email: string };

export async function getWaSession(): Promise<WaSession | null> {
  const cookieStore = await cookies();
  const role = parseRoleCookie(cookieStore.get("wa_role")?.value);
  const email = cookieStore.get("wa_email")?.value?.trim().toLowerCase() ?? "";
  if (!role || !email) return null;
  return { role, email };
}

export function isLicenseElevatedRole(role: Role): boolean {
  return role === "owner" || role === "admin";
}
