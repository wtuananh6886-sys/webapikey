import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { mapPolicyRowToApi, monthTag } from "@/lib/account-policy";
import { accountPolicies, adminCredentials, admins } from "@/lib/mock-data";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";
import type { AccountPolicy, AdminStatus, LicensePlan, Role } from "@/types/domain";

const PatchUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "support", "viewer"]).optional(),
  status: z.enum(["active", "suspended", "invited"]).optional(),
  assignedPlan: z.enum(["basic", "pro", "premium"]).optional(),
  monthlyPackageTokenLimit: z.number().int().min(0).max(20000).optional(),
  monthlyKeyLimit: z.number().int().min(0).max(200000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const DeleteUserSchema = z.object({
  email: z.string().email(),
});

async function getAuth() {
  const cookieStore = await cookies();
  return {
    role: cookieStore.get("wa_role")?.value ?? "viewer",
    email: (cookieStore.get("wa_email")?.value ?? "").toLowerCase(),
  };
}

function isPrivileged(role: string) {
  return role === "owner" || role === "admin";
}

function isOwner(role: string) {
  return role === "owner";
}

function countMockOwners() {
  return adminCredentials.filter((c) => c.role === "owner").length;
}

function isProtectedOwnerEmail(email: string) {
  const cred = adminCredentials.find((c) => c.email.toLowerCase() === email.toLowerCase());
  if (!cred || cred.role !== "owner") return false;
  return countMockOwners() <= 1;
}

function buildMockUserList(requesterEmail: string) {
  const emails = new Set<string>();
  adminCredentials.forEach((c) => emails.add(c.email.toLowerCase()));
  admins.forEach((a) => emails.add(a.email.toLowerCase()));

  return Array.from(emails).map((email) => {
    const cred = adminCredentials.find((c) => c.email.toLowerCase() === email);
    const adm = admins.find((a) => a.email.toLowerCase() === email);
    const pol = accountPolicies.find((p) => p.email.toLowerCase() === email);
    const role = (cred?.role ?? adm?.role ?? "viewer") as Role;
    const status = (adm?.status ?? "active") as AdminStatus;
    const protectedOwner = isProtectedOwnerEmail(email);

    return {
      id: adm?.id ?? `cred_${email.replace(/[^a-z0-9]/gi, "_")}`,
      email,
      username: cred?.username ?? adm?.username ?? email.split("@")[0],
      role,
      status,
      createdAt: adm?.createdAt ?? new Date().toISOString(),
      lastLoginAt: adm?.lastLogin ?? null,
      hasLoginCredentials: Boolean(cred),
      source: "mock" as const,
      policy: pol
        ? {
            assignedPlan: pol.assignedPlan,
            monthlyPackageTokenLimit: pol.monthlyPackageTokenLimit,
            monthlyKeyLimit: pol.monthlyKeyLimit,
            packageTokensUsedThisMonth: pol.packageTokensUsedThisMonth,
            keysUsedThisMonth: pol.keysUsedThisMonth,
            expiresAt: pol.expiresAt,
          }
        : null,
      flags: {
        protectedOwner,
        isSelf: email === requesterEmail,
      },
    };
  });
}

export async function GET() {
  const { role, email: requesterEmail } = await getAuth();
  if (!isPrivileged(role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: userRows, error: uErr } = await supabase
        .from("users")
        .select("id, email, created_at")
        .order("created_at", { ascending: false });
      if (uErr) return NextResponse.json({ message: uErr.message }, { status: 500 });

      const users = userRows ?? [];
      const userIds = users.map((u) => u.id);
      const { data: profiles } =
        userIds.length > 0
          ? await supabase.from("admin_profiles").select("*").in("user_id", userIds)
          : { data: [] as Record<string, unknown>[] };
      const profileByUserId = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));

      const emails = users.map((u) => String(u.email).toLowerCase());
      const { data: policyRows } =
        emails.length > 0
          ? await supabase.from("account_policies").select("*").in("email", emails)
          : { data: [] as Record<string, unknown>[] };
      const policyByEmail = new Map((policyRows ?? []).map((p) => [String(p.email).toLowerCase(), p]));

      const currentMonth = monthTag();
      const listed = users.map((u) => {
        const em = String(u.email).toLowerCase();
        const prof = profileByUserId.get(u.id as string) as
          | { username?: string; role?: string; status?: string; last_login_at?: string | null }
          | undefined;
        const rawPol = policyByEmail.get(em);
        const policy = rawPol ? mapPolicyRowToApi(rawPol as Parameters<typeof mapPolicyRowToApi>[0]) : null;
        const cred = adminCredentials.find((c) => c.email.toLowerCase() === em);
        const roleResolved = ((prof?.role as Role | undefined) ?? cred?.role ?? "viewer") as Role;
        const protectedOwner = isProtectedOwnerEmail(em);

        return {
          id: u.id as string,
          email: em,
          username: cred?.username ?? prof?.username ?? em.split("@")[0],
          role: roleResolved,
          status: (prof?.status ?? "active") as AdminStatus,
          createdAt: (u.created_at as string) ?? new Date().toISOString(),
          lastLoginAt: prof?.last_login_at ?? null,
          hasLoginCredentials: Boolean(cred),
          source: "supabase" as const,
          policy,
          flags: {
            protectedOwner,
            isSelf: em === requesterEmail,
          },
        };
      });

      const mockOnly = buildMockUserList(requesterEmail).filter(
        (m) => !listed.some((l) => l.email.toLowerCase() === m.email.toLowerCase())
      );
      return NextResponse.json({
        data: [...listed, ...mockOnly],
        meta: { canDeleteAccounts: isOwner(role) },
      });
    }
  }

  return NextResponse.json({
    data: buildMockUserList(requesterEmail),
    meta: { canDeleteAccounts: isOwner(role) },
  });
}

export async function PATCH(req: Request) {
  const { role: actorRole, email: actorEmail } = await getAuth();
  if (!isPrivileged(actorRole)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = PatchUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const email = data.email.toLowerCase();

  if (typeof data.role !== "undefined") {
    const cred = adminCredentials.find((c) => c.email.toLowerCase() === email);
    if (cred?.role === "owner" && data.role !== "owner" && isProtectedOwnerEmail(email)) {
      return NextResponse.json({ message: "Cannot remove the only owner account" }, { status: 403 });
    }
  }

  const credIdx = adminCredentials.findIndex((c) => c.email.toLowerCase() === email);
  const cred = credIdx >= 0 ? adminCredentials[credIdx] : undefined;
  const adm = admins.find((a) => a.email.toLowerCase() === email);

  if (typeof data.role !== "undefined") {
    if (credIdx >= 0) adminCredentials[credIdx] = { ...adminCredentials[credIdx], role: data.role };
    if (adm) adm.role = data.role;
  }
  if (adm && typeof data.status !== "undefined") {
    adm.status = data.status;
  }

  let policy = accountPolicies.find((p) => p.email.toLowerCase() === email);
  const resolvedRole = (
    typeof data.role !== "undefined"
      ? data.role
      : ((cred?.role ?? adm?.role ?? policy?.role ?? "viewer") as Role)
  ) as Role;
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
      const { data: userRow } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
      if (userRow?.id) {
        const patchProf: Record<string, unknown> = {};
        if (typeof data.role !== "undefined") patchProf.role = data.role;
        if (typeof data.status !== "undefined") patchProf.status = data.status;
        if (Object.keys(patchProf).length > 0) {
          const { error } = await supabase.from("admin_profiles").update(patchProf).eq("user_id", userRow.id);
          if (error) return NextResponse.json({ message: error.message }, { status: 500 });
        }
      }

      const { data: existing } = await supabase.from("account_policies").select("*").eq("email", email).maybeSingle();
      const currentMonth = monthTag();
      const pkgUsed = existing && existing.usage_month === currentMonth ? existing.package_tokens_used_this_month : 0;
      const keysUsed = existing && existing.usage_month === currentMonth ? existing.keys_used_this_month : 0;

      const { error: polErr } = await supabase.from("account_policies").upsert(
        {
          email,
          role: resolvedRole,
          assigned_plan: policy.assignedPlan as LicensePlan,
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
      if (polErr) return NextResponse.json({ message: polErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, policy: policy satisfies AccountPolicy });
}

export async function DELETE(req: Request) {
  const { role: actorRole, email: actorEmail } = await getAuth();
  if (!isOwner(actorRole)) {
    return NextResponse.json({ message: "Only owner can delete accounts" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = DeleteUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  if (email === actorEmail) {
    return NextResponse.json({ message: "You cannot delete your own account" }, { status: 400 });
  }
  if (isProtectedOwnerEmail(email)) {
    return NextResponse.json({ message: "Cannot delete the only owner account" }, { status: 403 });
  }

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: userRow } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
      if (userRow?.id) {
        await supabase.from("admin_profiles").delete().eq("user_id", userRow.id);
        await supabase.from("account_policies").delete().eq("email", email);
        const { error } = await supabase.from("users").delete().eq("id", userRow.id);
        if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      }
    }
  }

  const ci = adminCredentials.findIndex((c) => c.email.toLowerCase() === email);
  if (ci >= 0) adminCredentials.splice(ci, 1);
  const ai = admins.findIndex((a) => a.email.toLowerCase() === email);
  if (ai >= 0) admins.splice(ai, 1);
  const pi = accountPolicies.findIndex((p) => p.email.toLowerCase() === email);
  if (pi >= 0) accountPolicies.splice(pi, 1);

  return NextResponse.json({ ok: true });
}
