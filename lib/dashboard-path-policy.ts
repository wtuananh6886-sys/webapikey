import type { Role } from "@/types/domain";

/** Pure policy for Edge middleware — no server-only imports. */
export function parseRoleCookie(raw: string | undefined): Role | null {
  if (raw === "owner" || raw === "admin" || raw === "support" || raw === "viewer") return raw;
  return null;
}

/**
 * Whether this dashboard path is allowed for the given role.
 * owner/admin: full console. support: no Users/Policies/Settings. viewer: Overview + Activity logs only.
 */
export function dashboardPathAllowed(role: Role, pathname: string): boolean {
  const p = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  if (role === "owner" || role === "admin") return true;
  if (role === "support") {
    if (/^\/dashboard\/(users|admins|settings)(\/|$)/.test(p)) return false;
    return p.startsWith("/dashboard");
  }
  if (role === "viewer") {
    return p === "/dashboard" || p.startsWith("/dashboard/logs");
  }
  return false;
}

export function navPermForHref(href: string): string {
  if (href === "/dashboard") return "dashboard";
  if (href.startsWith("/dashboard/licenses")) return "licenses";
  if (href.startsWith("/dashboard/servers")) return "servers";
  if (href.startsWith("/dashboard/tweaks")) return "tweaks";
  if (href.startsWith("/dashboard/users")) return "users";
  if (href.startsWith("/dashboard/admins")) return "policies";
  if (href.startsWith("/dashboard/logs")) return "logs";
  if (href.startsWith("/dashboard/settings")) return "settings";
  return "dashboard";
}

/** Sidebar visibility (matches dashboardPathAllowed). */
export function roleMaySeeNavItem(role: Role, href: string): boolean {
  const perm = navPermForHref(href);
  if (role === "owner" || role === "admin") return true;
  if (role === "support") {
    return !["users", "policies", "settings"].includes(perm);
  }
  if (role === "viewer") {
    return perm === "dashboard" || perm === "logs";
  }
  return false;
}
