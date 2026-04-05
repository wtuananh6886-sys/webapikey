import { cookies } from "next/headers";
import type { Role } from "@/types/domain";
import { getWaSessionSecretBytes, verifyWaSessionJwt } from "@/lib/admin-session-jwt";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

export type WaSession = { role: Role; email: string; username: string };

/** ILIKE đúng một chuỗi (không wildcard) — khớp logic login. */
function ilikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const ROLE_RANK: Record<Role, number> = { owner: 4, admin: 3, support: 2, viewer: 1 };

function maxRole(a: Role, b: Role): Role {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

/** PostgREST / driver đôi khi trả enum không phải strict string — chuẩn hóa. */
function parseRoleFromDb(v: unknown): Role | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "owner" || s === "admin" || s === "support" || s === "viewer") return s as Role;
  return null;
}

/**
 * JWT giữ snapshot lúc đăng nhập. Với Supabase:
 * - `admin_profiles.role` là nguồn chính (ghi đè JWT).
 * - `account_policies.role` được max theo cấp (owner > admin > support > viewer) để tránh lệch
 *   khi chỉ sửa policy trên Table Editor mà quên `admin_profiles`.
 */
export async function getWaSession(): Promise<WaSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("wa_session")?.value?.trim();
  const secret = getWaSessionSecretBytes();
  if (!token || !secret) return null;
  const claims = await verifyWaSessionJwt(token, secret);
  if (!claims) return null;

  let role = claims.role;
  let username = claims.username;
  const email = claims.email;

  if (!isSupabaseEnabled()) {
    return { role, email, username };
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { role, email, username };
  }

  const key = email.trim().toLowerCase();
  let userId: string | null = null;

  const { data: byEq, error: errEq } = await supabase.from("users").select("id").eq("email", key).maybeSingle();
  if (errEq) {
    console.error("[getWaSession] users eq:", errEq.message);
  } else if (byEq != null && (byEq as { id?: unknown }).id != null) {
    userId = String((byEq as { id: unknown }).id);
  }

  if (!userId) {
    const { data: byIlike, error: errIlike } = await supabase
      .from("users")
      .select("id")
      .ilike("email", ilikeExact(key))
      .limit(1)
      .maybeSingle();
    if (errIlike) {
      console.error("[getWaSession] users ilike:", errIlike.message);
    } else if (byIlike != null && (byIlike as { id?: unknown }).id != null) {
      userId = String((byIlike as { id: unknown }).id);
    }
  }

  if (userId) {
    const { data: profRows, error: profErr } = await supabase
      .from("admin_profiles")
      .select("username, role")
      .eq("user_id", userId)
      .limit(1);

    if (profErr) {
      console.error("[getWaSession] admin_profiles:", profErr.message);
    } else {
      const profile = profRows?.[0];
      const profRole = profile ? parseRoleFromDb(profile.role) : null;
      if (profRole) {
        role = profRole;
      }
      const profUsername = String(profile?.username ?? "").trim();
      if (profUsername) {
        username = profUsername;
      }
    }
  }

  const { data: polRows, error: polErr } = await supabase
    .from("account_policies")
    .select("role")
    .eq("email", key)
    .limit(1);

  if (polErr) {
    console.error("[getWaSession] account_policies:", polErr.message);
  } else {
    const polRole = polRows?.[0] ? parseRoleFromDb(polRows[0].role) : null;
    if (polRole) {
      role = maxRole(role, polRole);
    }
  }

  return { role, email, username };
}

export function isLicenseElevatedRole(role: Role): boolean {
  return role === "owner" || role === "admin";
}
