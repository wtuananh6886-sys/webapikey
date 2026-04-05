import { NextResponse } from "next/server";
import { z } from "zod";
import { mapPolicyRowToApi, monthTag, quotaForAssignedPlan } from "@/lib/account-policy";
import { accountPolicies, admins } from "@/lib/mock-data";
import { getWaSession } from "@/lib/session-cookies";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";
import type { AccountPolicy, AdminUser, LicensePlan, Role } from "@/types/domain";

const UpdatePolicySchema = z.object({
  email: z.string().email(),
  assignedPlan: z.enum(["basic", "pro", "premium"]).optional(),
  monthlyPackageTokenLimit: z.number().int().min(0).max(20000).optional(),
  monthlyKeyLimit: z.number().int().min(0).max(200000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

async function getAuthedRole(): Promise<Role | null> {
  const s = await getWaSession();
  return s?.role ?? null;
}

function isPrivileged(role: string) {
  return role === "owner" || role === "admin";
}

function mergeAdminsWithDb(
  dbList: Array<{
    id: string;
    username: string;
    email: string;
    role: Role;
    status: string;
    lastLogin: string | null;
    createdAt: string;
  }>
): AdminUser[] {
  const byEmail = new Map<string, AdminUser>();
  for (const a of dbList) {
    byEmail.set(a.email.toLowerCase(), {
      id: a.id,
      username: a.username,
      email: a.email,
      role: a.role,
      status: a.status as AdminUser["status"],
      lastLogin: a.lastLogin,
      createdAt: a.createdAt,
    });
  }
  for (const a of admins) {
    if (!byEmail.has(a.email.toLowerCase())) {
      byEmail.set(a.email.toLowerCase(), a);
    }
  }
  return Array.from(byEmail.values());
}

export async function GET() {
  const role = await getAuthedRole();
  if (!role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isPrivileged(role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let mergedAdmins = [...admins];

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: profiles, error: pErr } = await supabase
        .from("admin_profiles")
        .select("id, user_id, username, role, status, last_login_at, created_at");
      if (pErr) return NextResponse.json({ message: pErr.message }, { status: 500 });

      const userIds = [...new Set((profiles ?? []).map((p) => p.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: userRows, error: uErr } = await supabase.from("users").select("id, email").in("id", userIds);
        if (uErr) return NextResponse.json({ message: uErr.message }, { status: 500 });
        const emailByUserId = new Map((userRows ?? []).map((u) => [u.id, u.email as string]));

        const fromDb = (profiles ?? [])
          .map((p) => {
            const em = emailByUserId.get(p.user_id);
            if (!em) return null;
            return {
              id: p.id as string,
              username: p.username as string,
              email: em,
              role: p.role as Role,
              status: p.status as string,
              lastLogin: (p.last_login_at as string | null) ?? null,
              createdAt: (p.created_at as string) ?? new Date().toISOString(),
            };
          })
          .filter(Boolean) as Array<{
            id: string;
            username: string;
            email: string;
            role: Role;
            status: string;
            lastLogin: string | null;
            createdAt: string;
          }>;

        mergedAdmins = mergeAdminsWithDb(fromDb);
      }

      const emails = mergedAdmins.map((a) => a.email.toLowerCase());
      const { data: policyRows, error: polErr } = await supabase.from("account_policies").select("*").in("email", emails);
      if (polErr) return NextResponse.json({ message: polErr.message }, { status: 500 });

      const policyMap = new Map((policyRows ?? []).map((row) => [String(row.email).toLowerCase(), row]));

      const rows = mergedAdmins.map((admin) => {
        const row = policyMap.get(admin.email.toLowerCase());
        const policy = row ? mapPolicyRowToApi(row) : null;
        return { admin, policy };
      });
      return NextResponse.json({ data: rows });
    }
  }

  const rows = mergedAdmins.map((admin) => {
    const policy = accountPolicies.find((p) => p.email.toLowerCase() === admin.email.toLowerCase()) ?? null;
    return { admin, policy };
  });
  return NextResponse.json({ data: rows });
}

export async function PATCH(req: Request) {
  const role = await getAuthedRole();
  if (!role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isPrivileged(role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const payload = await req.json();
  const parsed = UpdatePolicySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const email = data.email.toLowerCase();
  const adminRecord = admins.find((a) => a.email.toLowerCase() === email);
  let resolvedRole: Role = adminRecord?.role ?? "viewer";
  if (!adminRecord && isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: userRow } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
      if (userRow?.id) {
        const { data: prof } = await supabase
          .from("admin_profiles")
          .select("role")
          .eq("user_id", userRow.id)
          .maybeSingle();
        if (prof?.role && (prof.role === "owner" || prof.role === "admin" || prof.role === "support" || prof.role === "viewer")) {
          resolvedRole = prof.role;
        }
      }
    }
  }

  type PolicyRow = {
    assigned_plan: string;
    monthly_package_token_limit: number;
    monthly_key_limit: number;
    package_tokens_used_this_month: number;
    keys_used_this_month: number;
    usage_month: string | null;
    expires_at: string | null;
  };
  const currentMonth = monthTag();
  let dbExisting: PolicyRow | null = null;
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: row } = await supabase.from("account_policies").select("*").eq("email", email).maybeSingle();
      if (row) dbExisting = row as PolicyRow;
    }
  }

  const mockPol = accountPolicies.find((p) => p.email.toLowerCase() === email);
  let assignedPlan: LicensePlan = (dbExisting?.assigned_plan as LicensePlan) ?? mockPol?.assignedPlan ?? "basic";
  let monthlyPackageTokenLimit =
    dbExisting?.monthly_package_token_limit ?? mockPol?.monthlyPackageTokenLimit ?? 3;
  let monthlyKeyLimit = dbExisting?.monthly_key_limit ?? mockPol?.monthlyKeyLimit ?? 30;
  let expiresAtOut: string | null =
    typeof data.expiresAt !== "undefined" ? data.expiresAt : (dbExisting?.expires_at ?? mockPol?.expiresAt ?? null);

  if (typeof data.assignedPlan !== "undefined") {
    assignedPlan = data.assignedPlan;
    if (typeof data.monthlyPackageTokenLimit === "undefined" && typeof data.monthlyKeyLimit === "undefined") {
      const q = quotaForAssignedPlan(assignedPlan);
      monthlyPackageTokenLimit = q.monthlyPackageTokenLimit;
      monthlyKeyLimit = q.monthlyKeyLimit;
    }
  }
  if (typeof data.monthlyPackageTokenLimit !== "undefined") monthlyPackageTokenLimit = data.monthlyPackageTokenLimit;
  if (typeof data.monthlyKeyLimit !== "undefined") monthlyKeyLimit = data.monthlyKeyLimit;

  let pkgUsed = 0;
  let keysUsed = 0;
  if (dbExisting) {
    pkgUsed = dbExisting.usage_month === currentMonth ? dbExisting.package_tokens_used_this_month : 0;
    keysUsed = dbExisting.usage_month === currentMonth ? dbExisting.keys_used_this_month : 0;
  } else if (mockPol) {
    pkgUsed = mockPol.packageTokensUsedThisMonth;
    keysUsed = mockPol.keysUsedThisMonth;
  }

  let policy = mockPol;
  if (!policy) {
    policy = {
      email,
      role: resolvedRole,
      assignedPlan,
      monthlyPackageTokenLimit,
      monthlyKeyLimit,
      packageTokensUsedThisMonth: pkgUsed,
      keysUsedThisMonth: keysUsed,
      expiresAt: expiresAtOut,
      updatedAt: new Date().toISOString(),
    };
    accountPolicies.push(policy);
  }
  policy.role = resolvedRole;
  policy.assignedPlan = assignedPlan;
  policy.monthlyPackageTokenLimit = monthlyPackageTokenLimit;
  policy.monthlyKeyLimit = monthlyKeyLimit;
  policy.packageTokensUsedThisMonth = pkgUsed;
  policy.keysUsedThisMonth = keysUsed;
  policy.expiresAt = expiresAtOut;
  policy.updatedAt = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { error } = await supabase.from("account_policies").upsert(
        {
          email,
          role: resolvedRole,
          assigned_plan: assignedPlan,
          monthly_package_token_limit: monthlyPackageTokenLimit,
          monthly_key_limit: monthlyKeyLimit,
          package_tokens_used_this_month: pkgUsed,
          keys_used_this_month: keysUsed,
          usage_month: currentMonth,
          expires_at: expiresAtOut,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: policy satisfies AccountPolicy });
}
