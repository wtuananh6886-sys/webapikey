import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { mapPolicyRowToApi, monthTag } from "@/lib/account-policy";
import { accountPolicies, admins } from "@/lib/mock-data";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";
import type { AccountPolicy, AdminUser, Role } from "@/types/domain";

const UpdatePolicySchema = z.object({
  email: z.string().email(),
  assignedPlan: z.enum(["basic", "pro", "premium"]).optional(),
  monthlyPackageTokenLimit: z.number().int().min(0).max(20000).optional(),
  monthlyKeyLimit: z.number().int().min(0).max(200000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

async function getRole() {
  const cookieStore = await cookies();
  return cookieStore.get("wa_role")?.value ?? "viewer";
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
  const role = await getRole();
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
  const role = await getRole();
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

  let policy = accountPolicies.find((p) => p.email.toLowerCase() === email);
  if (!policy) {
    policy = {
      email,
      role: resolvedRole,
      assignedPlan: "basic",
      monthlyPackageTokenLimit: 3,
      monthlyKeyLimit: 30,
      packageTokensUsedThisMonth: 0,
      keysUsedThisMonth: 0,
      expiresAt: null,
      updatedAt: new Date().toISOString(),
    };
    accountPolicies.push(policy);
  }
  policy.role = resolvedRole;

  if (typeof data.assignedPlan !== "undefined") policy.assignedPlan = data.assignedPlan;
  if (typeof data.monthlyPackageTokenLimit !== "undefined") policy.monthlyPackageTokenLimit = data.monthlyPackageTokenLimit;
  if (typeof data.monthlyKeyLimit !== "undefined") policy.monthlyKeyLimit = data.monthlyKeyLimit;
  if (typeof data.expiresAt !== "undefined") policy.expiresAt = data.expiresAt;
  policy.updatedAt = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: existing } = await supabase.from("account_policies").select("*").eq("email", email).maybeSingle();
      const currentMonth = monthTag();
      const pkgUsed =
        existing && existing.usage_month === currentMonth ? existing.package_tokens_used_this_month : 0;
      const keysUsed = existing && existing.usage_month === currentMonth ? existing.keys_used_this_month : 0;

      const { error } = await supabase.from("account_policies").upsert(
        {
          email,
          role: resolvedRole,
          assigned_plan: policy.assignedPlan,
          monthly_package_token_limit: policy.monthlyPackageTokenLimit,
          monthly_key_limit: policy.monthlyKeyLimit,
          package_tokens_used_this_month: pkgUsed,
          keys_used_this_month: keysUsed,
          usage_month: currentMonth,
          expires_at: policy.expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: policy satisfies AccountPolicy });
}
