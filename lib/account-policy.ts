import type { SupabaseClient } from "@supabase/supabase-js";
import type { LicensePlan, Role } from "@/types/domain";

export function monthTag() {
  const now = new Date();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${now.getFullYear()}-${m}`;
}

export function defaultLimitsForRole(role: Role): {
  assignedPlan: LicensePlan;
  monthlyPackageTokenLimit: number;
  monthlyKeyLimit: number;
} {
  if (role === "owner" || role === "admin") {
    return { assignedPlan: "premium", monthlyPackageTokenLimit: 99_999, monthlyKeyLimit: 999_999 };
  }
  if (role === "support") {
    return { assignedPlan: "pro", monthlyPackageTokenLimit: 50, monthlyKeyLimit: 500 };
  }
  return { assignedPlan: "basic", monthlyPackageTokenLimit: 3, monthlyKeyLimit: 30 };
}

/** Ensure a row exists after login; sync role, do not wipe usage unless first insert. */
export async function ensureAccountPolicyOnLogin(supabase: SupabaseClient, email: string, role: Role) {
  const normalized = email.toLowerCase().trim();
  const m = monthTag();
  const defaults = defaultLimitsForRole(role);

  const { data: existing, error: readErr } = await supabase
    .from("account_policies")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();
  if (readErr) throw readErr;

  if (!existing) {
    const { error } = await supabase.from("account_policies").insert({
      email: normalized,
      role,
      assigned_plan: defaults.assignedPlan,
      monthly_package_token_limit: defaults.monthlyPackageTokenLimit,
      monthly_key_limit: defaults.monthlyKeyLimit,
      package_tokens_used_this_month: 0,
      keys_used_this_month: 0,
      usage_month: m,
      expires_at: null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }

  const patch: Record<string, unknown> = {
    role,
    updated_at: new Date().toISOString(),
  };
  if (role === "owner" || role === "admin") {
    patch.assigned_plan = "premium";
    patch.monthly_package_token_limit = Math.max(
      existing.monthly_package_token_limit ?? 0,
      defaults.monthlyPackageTokenLimit
    );
    patch.monthly_key_limit = Math.max(existing.monthly_key_limit ?? 0, defaults.monthlyKeyLimit);
  }

  const { error: updErr } = await supabase.from("account_policies").update(patch).eq("email", normalized);
  if (updErr) throw updErr;
}

/**
 * Create policy row if missing (e.g. user registered before table existed, or never synced on login).
 * Does not reset usage for existing rows.
 */
export async function ensureAccountPolicyRow(supabase: SupabaseClient, email: string, role: Role) {
  const normalized = email.toLowerCase().trim();
  const m = monthTag();
  const defaults = defaultLimitsForRole(role);

  const { data: existing, error: readErr } = await supabase
    .from("account_policies")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (readErr) return { ok: false as const, message: readErr.message };
  if (existing) return { ok: true as const };

  const { error: insErr } = await supabase.from("account_policies").insert({
    email: normalized,
    role,
    assigned_plan: defaults.assignedPlan,
    monthly_package_token_limit: defaults.monthlyPackageTokenLimit,
    monthly_key_limit: defaults.monthlyKeyLimit,
    package_tokens_used_this_month: 0,
    keys_used_this_month: 0,
    usage_month: m,
    expires_at: null,
    updated_at: new Date().toISOString(),
  });
  if (insErr) {
    if (insErr.code === "23505") return { ok: true as const };
    return { ok: false as const, message: insErr.message };
  }
  return { ok: true as const };
}

export function mapPolicyRowToApi(row: {
  assigned_plan: string;
  monthly_package_token_limit: number;
  monthly_key_limit: number;
  package_tokens_used_this_month: number;
  keys_used_this_month: number;
  usage_month: string | null;
  expires_at: string | null;
}) {
  const currentMonth = monthTag();
  const shouldReset = row.usage_month !== currentMonth;
  return {
    assignedPlan: row.assigned_plan as LicensePlan,
    monthlyPackageTokenLimit: row.monthly_package_token_limit,
    monthlyKeyLimit: row.monthly_key_limit,
    packageTokensUsedThisMonth: shouldReset ? 0 : row.package_tokens_used_this_month,
    keysUsedThisMonth: shouldReset ? 0 : row.keys_used_this_month,
    expiresAt: row.expires_at,
    usageMonth: row.usage_month ?? undefined,
  };
}
