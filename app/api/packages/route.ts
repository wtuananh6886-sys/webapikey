import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { defaultLimitsForRole, ensureAccountPolicyRow, monthTag } from "@/lib/account-policy";
import { accountPolicies, userPackages } from "@/lib/mock-data";
import type { AccountPolicy, PackageStatus, Role, UserPackage } from "@/types/domain";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

const CreatePackageSchema = z.object({
  name: z.string().min(2).max(80),
});

function generatePackageToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "PKG_";
  for (let i = 0; i < 16; i += 1) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function normalizePackageName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getAuthContext() {
  const cookieStore = await cookies();
  const role = cookieStore.get("wa_role")?.value ?? "viewer";
  const email = (cookieStore.get("wa_email")?.value ?? "viewer@local").toLowerCase();
  return { role, email };
}

function parseRole(raw: string | undefined): Role {
  if (raw === "owner" || raw === "admin" || raw === "support" || raw === "viewer") return raw;
  return "viewer";
}

async function consumePackageTokenQuota(email: string, role: Role) {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const ensured = await ensureAccountPolicyRow(supabase, email, role);
      if (!ensured.ok) return { ok: false as const, status: 500, message: ensured.message };
      const currentMonth = monthTag();
      const { data: row, error } = await supabase
        .from("account_policies")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      if (error) return { ok: false as const, status: 500, message: error.message };
      if (!row) return { ok: false as const, status: 403, message: "No policy assigned for this account" };
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false as const, status: 403, message: "Account policy expired" };
      }
      const used = row.usage_month === currentMonth ? row.package_tokens_used_this_month : 0;
      if (used >= row.monthly_package_token_limit) {
        return { ok: false as const, status: 403, message: "Monthly package token limit exceeded" };
      }
      const { error: updateErr } = await supabase
        .from("account_policies")
        .update({
          package_tokens_used_this_month: used + 1,
          usage_month: currentMonth,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email);
      if (updateErr) return { ok: false as const, status: 500, message: updateErr.message };
      return { ok: true as const };
    }
  }
  let policy = accountPolicies.find((it) => it.email.toLowerCase() === email.toLowerCase());
  if (!policy) {
    const defaults = defaultLimitsForRole(role);
    const createdPolicy: AccountPolicy = {
      email: email.toLowerCase(),
      role,
      assignedPlan: defaults.assignedPlan,
      monthlyPackageTokenLimit: defaults.monthlyPackageTokenLimit,
      monthlyKeyLimit: defaults.monthlyKeyLimit,
      packageTokensUsedThisMonth: 0,
      keysUsedThisMonth: 0,
      expiresAt: null,
      updatedAt: new Date().toISOString(),
    };
    policy = createdPolicy;
    accountPolicies.push(createdPolicy);
  }
  if (policy.expiresAt && new Date(policy.expiresAt).getTime() < Date.now()) {
    return { ok: false as const, status: 403, message: "Account policy expired" };
  }
  if (policy.packageTokensUsedThisMonth >= policy.monthlyPackageTokenLimit) {
    return { ok: false as const, status: 403, message: "Monthly package token limit exceeded" };
  }
  policy.packageTokensUsedThisMonth += 1;
  policy.updatedAt = new Date().toISOString();
  return { ok: true as const };
}

export async function GET() {
  const { role, email } = await getAuthContext();
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const query = supabase.from("user_packages").select("*").order("created_at", { ascending: false });
      const { data, error } =
        role === "owner" || role === "admin" ? await query : await query.eq("owner_email", email);
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      const rows = data ?? [];
      const missingTokenRows = rows.filter((row) => !row.token);
      if (missingTokenRows.length > 0) {
        for (const row of missingTokenRows) {
          await supabase
            .from("user_packages")
            .update({ token: generatePackageToken() })
            .eq("id", row.id);
        }
      }
      const { data: refreshed, error: refreshError } =
        role === "owner" || role === "admin"
          ? await query
          : await query.eq("owner_email", email);
      if (refreshError) return NextResponse.json({ message: refreshError.message }, { status: 500 });
      const mapped = (refreshed ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        token: row.token,
        ownerEmail: row.owner_email,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      return NextResponse.json({ data: mapped });
    }
  }
  const rows =
    role === "owner" || role === "admin"
      ? userPackages
      : userPackages.filter((pkg) => pkg.ownerEmail === email);
  return NextResponse.json({ data: rows });
}

export async function POST(req: Request) {
  const { email, role } = await getAuthContext();
  const payload = await req.json();
  const parsed = CreatePackageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const normalized = normalizePackageName(parsed.data.name);
  if (!normalized) return NextResponse.json({ message: "Invalid package name" }, { status: 400 });
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: dup } = await supabase.from("user_packages").select("id").eq("name", normalized).maybeSingle();
      if (dup) return NextResponse.json({ message: "Package already exists" }, { status: 409 });
    }
  } else if (userPackages.some((pkg) => pkg.name === normalized)) {
    return NextResponse.json({ message: "Package already exists" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const created: UserPackage = {
    id: `pkg_${Date.now()}`,
    name: normalized,
    token: generatePackageToken(),
    ownerEmail: email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  if (!(role === "owner" || role === "admin")) {
    const quota = await consumePackageTokenQuota(email, parseRole(role));
    if (!quota.ok) {
      return NextResponse.json({ message: quota.message }, { status: quota.status });
    }
  }
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      let data: Record<string, unknown> | null = null;
      let lastError: { message: string; code?: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const token = attempt === 0 ? created.token : generatePackageToken();
        const res = await supabase
          .from("user_packages")
          .insert({
            name: created.name,
            token,
            owner_email: created.ownerEmail,
            status: created.status,
          })
          .select("*")
          .single();
        if (!res.error && res.data) {
          data = res.data as Record<string, unknown>;
          break;
        }
        lastError = res.error ?? { message: "insert_failed" };
        const code = (res.error as { code?: string })?.code;
        const msg = res.error?.message ?? "";
        if (code === "23505" && (msg.includes("token") || msg.includes("user_packages_token"))) {
          continue;
        }
        return NextResponse.json({ message: res.error?.message ?? "Insert failed" }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ message: lastError?.message ?? "Insert failed after retries" }, { status: 500 });
      }
      const row = data as {
        id: string;
        name: string;
        token: string;
        owner_email: string;
        status: string;
        created_at: string;
        updated_at: string;
      };
      return NextResponse.json(
        {
          data: {
            id: row.id,
            name: row.name,
            token: row.token,
            ownerEmail: row.owner_email,
            status: row.status as PackageStatus,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          } satisfies UserPackage,
        },
        { status: 201 }
      );
    }
  }
  userPackages.unshift(created);
  return NextResponse.json({ data: created }, { status: 201 });
}

