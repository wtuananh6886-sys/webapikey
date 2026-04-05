import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureAccountPolicyRow, monthTag, quotaForAssignedPlan } from "@/lib/account-policy";
import { accountPolicies, userPackages } from "@/lib/mock-data";
import type { AccountPolicy, PackageStatus, Role, UserPackage } from "@/types/domain";
import { getWaSession } from "@/lib/session-cookies";
import { randomAlphanum } from "@/lib/secure-random";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

const CreatePackageSchema = z.object({
  name: z.string().min(2).max(80),
});

const PatchPackageSchema = z.object({
  name: z.string().min(2).max(80),
  activationUiTitle: z.union([z.string().max(80), z.null()]).optional(),
  activationUiSubtitle: z.union([z.string().max(160), z.null()]).optional(),
  /** Owner/admin only: token cũ hết hiệu lực, cấp PKG_ mới (client phải cập nhật packageToken). */
  regenerateToken: z.literal(true).optional(),
});

function generatePackageToken() {
  return `PKG_${randomAlphanum(16)}`;
}

function normalizePackageName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function requirePackageSession() {
  const s = await getWaSession();
  if (!s) return null;
  return { role: s.role, email: s.email.toLowerCase() };
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
    const q = quotaForAssignedPlan("basic");
    const createdPolicy: AccountPolicy = {
      email: email.toLowerCase(),
      role,
      assignedPlan: "basic",
      monthlyPackageTokenLimit: q.monthlyPackageTokenLimit,
      monthlyKeyLimit: q.monthlyKeyLimit,
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
  const ctx = await requirePackageSession();
  if (!ctx) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { role, email } = ctx;
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
        archivedAt: row.archived_at ?? null,
        activationUiTitle: row.activation_ui_title ?? null,
        activationUiSubtitle: row.activation_ui_subtitle ?? null,
      }));
      const activeCount = mapped.filter((p) => p.status === "active").length;
      const archivedCount = mapped.filter((p) => p.status === "archived").length;
      return NextResponse.json({
        data: mapped,
        meta: { activeCount, archivedCount, totalCount: mapped.length },
      });
    }
  }
  const rows =
    role === "owner" || role === "admin"
      ? userPackages
      : userPackages.filter((pkg) => pkg.ownerEmail === email);
  const activeCount = rows.filter((p) => p.status === "active").length;
  const archivedCount = rows.filter((p) => p.status === "archived").length;
  return NextResponse.json({
    data: rows,
    meta: { activeCount, archivedCount, totalCount: rows.length },
  });
}

export async function POST(req: Request) {
  if (process.env.VERCEL === "1" && !isSupabaseEnabled()) {
    return NextResponse.json(
      {
        message:
          "Persistence chưa được bật trên production. Hãy cấu hình NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trên Vercel.",
      },
      { status: 503 }
    );
  }
  const ctx = await requirePackageSession();
  if (!ctx) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { email, role } = ctx;
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
  if (role !== "owner") {
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

export async function PATCH(req: Request) {
  if (process.env.VERCEL === "1" && !isSupabaseEnabled()) {
    return NextResponse.json(
      {
        message:
          "Persistence chưa được bật trên production. Hãy cấu hình NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trên Vercel.",
      },
      { status: 503 }
    );
  }
  const ctx = await requirePackageSession();
  if (!ctx) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { email, role } = ctx;
  const payload = await req.json();
  const parsed = PatchPackageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }
  const { name, activationUiTitle, activationUiSubtitle, regenerateToken } = parsed.data;
  const normalized = normalizePackageName(name);
  if (!normalized) return NextResponse.json({ message: "Invalid package name" }, { status: 400 });

  const elevated = role === "owner" || role === "admin";

  if (regenerateToken === true && !elevated) {
    return NextResponse.json({ message: "Forbidden — chỉ owner hoặc admin được đổi package token" }, { status: 403 });
  }

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: row, error: fetchErr } = await supabase.from("user_packages").select("*").eq("name", normalized).maybeSingle();
      if (fetchErr) return NextResponse.json({ message: fetchErr.message }, { status: 500 });
      if (!row) return NextResponse.json({ message: "Package not found" }, { status: 404 });
      if (row.status === "archived") {
        return NextResponse.json({ message: "Package is archived — restore not supported via API" }, { status: 400 });
      }
      if (!elevated && String(row.owner_email ?? "").toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updated_at: now };
      if (activationUiTitle !== undefined) updates.activation_ui_title = activationUiTitle;
      if (activationUiSubtitle !== undefined) updates.activation_ui_subtitle = activationUiSubtitle;

      if (regenerateToken === true) {
        let updatedRow: Record<string, unknown> | null = null;
        let lastErr: { message: string; code?: string } | null = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const token = generatePackageToken();
          const res = await supabase
            .from("user_packages")
            .update({ ...updates, token })
            .eq("name", normalized)
            .select("*")
            .single();
          if (!res.error && res.data) {
            updatedRow = res.data as Record<string, unknown>;
            break;
          }
          lastErr = res.error ?? { message: "update_failed" };
          const code = (res.error as { code?: string })?.code;
          const msg = res.error?.message ?? "";
          if (code === "23505" && (msg.includes("token") || msg.includes("user_packages_token"))) {
            continue;
          }
          return NextResponse.json({ message: res.error?.message ?? "Update failed" }, { status: 500 });
        }
        if (!updatedRow) {
          return NextResponse.json({ message: lastErr?.message ?? "Could not assign unique token" }, { status: 500 });
        }
        const { data: actor } = await supabase.from("users").select("id").eq("email", email.toLowerCase()).maybeSingle();
        const { error: logErr } = await supabase.from("activity_logs").insert({
          actor_id: actor?.id ?? null,
          actor_name: email,
          action: "package_token_regenerated",
          target_type: "package",
          target_id: String(updatedRow.id),
          target_name: String(updatedRow.name),
          severity: "warning",
          metadata: { owner_email: updatedRow.owner_email, by_role: role },
        });
        if (logErr) {
          console.warn("[packages PATCH] activity_logs insert:", logErr.message);
        }
        const ur = updatedRow as {
          id: string;
          name: string;
          token: string;
          owner_email: string;
          status: string;
          created_at: string;
          updated_at: string;
          activation_ui_title?: string | null;
          activation_ui_subtitle?: string | null;
          archived_at?: string | null;
        };
        return NextResponse.json({
          message: "Đã đổi package token. Token cũ không còn hiệu lực — cập nhật client / user.",
          data: {
            id: ur.id,
            name: ur.name,
            token: ur.token,
            ownerEmail: ur.owner_email,
            status: ur.status as PackageStatus,
            createdAt: ur.created_at,
            updatedAt: ur.updated_at,
            activationUiTitle: ur.activation_ui_title ?? null,
            activationUiSubtitle: ur.activation_ui_subtitle ?? null,
            archivedAt: ur.archived_at ?? null,
          } satisfies UserPackage,
        });
      }

      const { data: updated, error: upErr } = await supabase
        .from("user_packages")
        .update(updates)
        .eq("name", normalized)
        .select("*")
        .single();
      if (upErr) return NextResponse.json({ message: upErr.message }, { status: 500 });
      return NextResponse.json({
        data: {
          id: updated.id,
          name: updated.name,
          token: updated.token,
          ownerEmail: updated.owner_email,
          status: updated.status as PackageStatus,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
          activationUiTitle: updated.activation_ui_title ?? null,
          activationUiSubtitle: updated.activation_ui_subtitle ?? null,
          archivedAt: updated.archived_at ?? null,
        } satisfies UserPackage,
      });
    }
  }

  const pkg = userPackages.find((p) => p.name === normalized);
  if (!pkg) return NextResponse.json({ message: "Package not found" }, { status: 404 });
  if (pkg.status === "archived") {
    return NextResponse.json({ message: "Package is archived — restore not supported via API" }, { status: 400 });
  }
  if (!elevated && pkg.ownerEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (regenerateToken === true) {
    pkg.token = generatePackageToken();
  }
  if (activationUiTitle !== undefined) pkg.activationUiTitle = activationUiTitle ?? undefined;
  if (activationUiSubtitle !== undefined) pkg.activationUiSubtitle = activationUiSubtitle ?? undefined;
  pkg.updatedAt = new Date().toISOString();
  return NextResponse.json({
    ...(regenerateToken === true
      ? { message: "Đã đổi package token. Token cũ không còn hiệu lực — cập nhật client / user." }
      : {}),
    data: pkg,
  });
}

/**
 * Soft-delete package: chỉ owner hoặc admin. Bản ghi vẫn trên DB (status archived + archived_at) để theo dõi / audit.
 */
export async function DELETE(req: Request) {
  if (process.env.VERCEL === "1" && !isSupabaseEnabled()) {
    return NextResponse.json(
      {
        message:
          "Persistence chưa được bật trên production. Hãy cấu hình NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trên Vercel.",
      },
      { status: 503 }
    );
  }
  const ctx = await requirePackageSession();
  if (!ctx) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { email, role } = ctx;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ message: "Forbidden — chỉ owner hoặc admin được gỡ package" }, { status: 403 });
  }

  const url = new URL(req.url);
  const rawName = url.searchParams.get("name")?.trim() ?? "";
  const normalized = normalizePackageName(rawName);
  if (!normalized) {
    return NextResponse.json({ message: "Thiếu hoặc sai tên package (query ?name=)" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: row, error: fetchErr } = await supabase.from("user_packages").select("*").eq("name", normalized).maybeSingle();
      if (fetchErr) return NextResponse.json({ message: fetchErr.message }, { status: 500 });
      if (!row) return NextResponse.json({ message: "Package not found" }, { status: 404 });
      if (row.status === "archived") {
        return NextResponse.json({
          message: "Package đã được gỡ trước đó (vẫn lưu trên server)",
          data: {
            id: row.id,
            name: row.name,
            token: row.token,
            ownerEmail: row.owner_email,
            status: "archived" as PackageStatus,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            archivedAt: row.archived_at ?? now,
          } satisfies UserPackage,
        });
      }

      const { data: updated, error: upErr } = await supabase
        .from("user_packages")
        .update({
          status: "archived",
          archived_at: now,
          updated_at: now,
        })
        .eq("name", normalized)
        .select("*")
        .single();
      if (upErr) return NextResponse.json({ message: upErr.message }, { status: 500 });

      const { data: actor } = await supabase.from("users").select("id").eq("email", email.toLowerCase()).maybeSingle();
      const { error: logErr } = await supabase.from("activity_logs").insert({
        actor_id: actor?.id ?? null,
        actor_name: email,
        action: "package_archived",
        target_type: "package",
        target_id: String(updated.id),
        target_name: updated.name,
        severity: "warning",
        metadata: { owner_email: updated.owner_email, by_role: role },
      });
      if (logErr) {
        console.warn("[packages DELETE] activity_logs insert:", logErr.message);
      }

      return NextResponse.json({
        message: "Đã gỡ package (soft delete). Dữ liệu key / lịch sử vẫn trên server.",
        data: {
          id: updated.id,
          name: updated.name,
          token: updated.token,
          ownerEmail: updated.owner_email,
          status: updated.status as PackageStatus,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
          archivedAt: updated.archived_at ?? now,
        } satisfies UserPackage,
      });
    }
  }

  const pkg = userPackages.find((p) => p.name === normalized);
  if (!pkg) return NextResponse.json({ message: "Package not found" }, { status: 404 });
  if (pkg.status === "archived") {
    return NextResponse.json({
      message: "Package đã được gỡ trước đó (vẫn lưu trên server)",
      data: pkg,
    });
  }
  pkg.status = "archived";
  pkg.archivedAt = now;
  pkg.updatedAt = now;
  return NextResponse.json({
    message: "Đã gỡ package (soft delete). Dữ liệu key / lịch sử vẫn trên server.",
    data: pkg,
  });
}

