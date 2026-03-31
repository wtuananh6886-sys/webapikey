import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { monthTag } from "@/lib/account-policy";
import { accountPolicies, userPackages } from "@/lib/mock-data";
import type { UserPackage } from "@/types/domain";
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

async function consumePackageTokenQuota(email: string) {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
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
  const policy = accountPolicies.find((it) => it.email.toLowerCase() === email.toLowerCase());
  if (!policy) return { ok: false as const, status: 403, message: "No policy assigned for this account" };
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
    const quota = await consumePackageTokenQuota(email);
    if (!quota.ok) {
      return NextResponse.json({ message: quota.message }, { status: quota.status });
    }
  }
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("user_packages")
        .insert({
          name: created.name,
          token: created.token,
          owner_email: created.ownerEmail,
          status: created.status,
        })
        .select("*")
        .single();
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      return NextResponse.json(
        {
          data: {
            id: data.id,
            name: data.name,
            token: data.token,
            ownerEmail: data.owner_email,
            status: data.status,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          } satisfies UserPackage,
        },
        { status: 201 }
      );
    }
  }
  userPackages.unshift(created);
  return NextResponse.json({ data: created }, { status: 201 });
}

