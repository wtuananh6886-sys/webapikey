import { cookies } from "next/headers";
import type { Role } from "@/types/domain";

export async function getSessionRole(): Promise<Role | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("wa_role")?.value ?? null;
  if (!raw) return null;
  if (raw === "owner" || raw === "admin" || raw === "support" || raw === "viewer") return raw;
  return null;
}

/** Align with `lib/dashboard-path-policy.ts` (middleware + sidebar). */
export function hasPermission(role: Role, perm: string) {
  const map: Record<Role, string[]> = {
    owner: ["all"],
    admin: ["all"],
    support: ["dashboard", "licenses", "logs", "servers", "tweaks"],
    viewer: ["dashboard", "logs"],
  };
  return map[role].includes("all") || map[role].includes(perm);
}
