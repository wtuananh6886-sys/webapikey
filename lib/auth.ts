import type { Role } from "@/types/domain";
import { getWaSession } from "@/lib/session-cookies";

export async function getSessionRole(): Promise<Role | null> {
  const s = await getWaSession();
  return s?.role ?? null;
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
