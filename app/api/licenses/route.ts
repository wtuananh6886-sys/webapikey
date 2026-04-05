import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureAccountPolicyRow, monthTag, quotaForAssignedPlan } from "@/lib/account-policy";
import {
  getLicenseKeyPepper,
  hashLicenseKey,
  licenseKeyPrefix,
  maskLicenseKeyForApi,
} from "@/lib/license-key-crypto";
import { accountPolicies, licenses, licenseUsageLogs, userPackages } from "@/lib/mock-data";
import { randomAlphanum } from "@/lib/secure-random";
import { getWaSession, isLicenseElevatedRole } from "@/lib/session-cookies";
import type { AccountPolicy, License, Role } from "@/types/domain";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

const CreateLicenseSchema = z.object({
  packageName: z.string().min(2).max(80),
  packageToken: z.string().min(8).max(120),
  keyMode: z.enum(["dynamic", "static"]),
  key: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().min(8).optional()
  ),
  plan: z.enum(["basic", "pro", "premium"]),
  status: z.enum(["active", "inactive", "expired", "banned", "revoked"]),
  assignedUser: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
    z.string().nullable().optional()
  ),
  deviceId: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
    z.string().nullable().optional()
  ),
  maxDevices: z.number().int().min(1).max(20),
  durationDays: z.number().int().min(1).max(3650).optional(),
  expiresAt: z.string().datetime().optional(),
}).superRefine((data, ctx) => {
  if (data.keyMode === "static" && !data.key?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["key"],
      message: "Static key requires a custom key value",
    });
  }
  if (!data.durationDays && !data.expiresAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationDays"],
      message: "durationDays or expiresAt is required",
    });
  }
});

const UpdateActionSchema = z.object({
  id: z.string(),
  action: z.enum(["ban", "revoke", "extend", "unban", "unrevoke", "activate", "deactivate"]),
  days: z.number().int().min(1).max(365).optional(),
});

const DeleteLicenseSchema = z.object({
  id: z.string(),
});

function generateLicenseKey() {
  const seg = () => randomAlphanum(4);
  return `AOVP-${seg()}-${seg()}-${seg()}`;
}

function normalizePackageName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generatePackageBoundLicenseKey(packageName: string, durationDays: number) {
  const normalized = normalizePackageName(packageName) || "default-package";
  return `${normalized}-${durationDays}day-${randomAlphanum(6)}`;
}

function keyMatchesFormat(key: string, packageName: string, durationDays: number) {
  const normalizedPackage = normalizePackageName(packageName);
  const pattern = new RegExp(`^${normalizedPackage}-${durationDays}day-[A-Z0-9]{6}$`);
  return pattern.test(key);
}

async function consumeKeyQuota(
  email: string,
  role: Role,
  requiredPlan: "basic" | "pro" | "premium"
) {
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
      if (row.assigned_plan !== requiredPlan) {
        return {
          ok: false as const,
          status: 403,
          message: `Plan not allowed for your account. Assigned plan: ${row.assigned_plan}`,
        };
      }
      const used = row.usage_month === currentMonth ? row.keys_used_this_month : 0;
      if (used >= row.monthly_key_limit) {
        return { ok: false as const, status: 403, message: "Monthly key limit exceeded" };
      }
      const { error: updateErr } = await supabase
        .from("account_policies")
        .update({
          keys_used_this_month: used + 1,
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
  if (policy.keysUsedThisMonth >= policy.monthlyKeyLimit) {
    return { ok: false as const, status: 403, message: "Monthly key limit exceeded" };
  }
  if (requiredPlan !== policy.assignedPlan) {
    return {
      ok: false as const,
      status: 403,
      message: `Plan not allowed for your account. Assigned plan: ${policy.assignedPlan}`,
    };
  }
  policy.keysUsedThisMonth += 1;
  policy.updatedAt = new Date().toISOString();
  return { ok: true as const };
}

async function insertLicenseLog(params: {
  licenseId: string;
  action: string;
  ip: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isSupabaseEnabled()) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from("license_logs").insert({
    license_id: params.licenseId,
    action: params.action,
    ip_address: params.ip,
    metadata: params.metadata ?? {},
  });
}

function mapSupabaseRowToLicense(row: Record<string, unknown>, options?: { plaintextKeyOverride?: string }): License {
  const legacyKey = row.key != null && String(row.key).length > 0 ? String(row.key) : "";
  const prefix = row.key_prefix != null ? String(row.key_prefix) : legacyKey ? licenseKeyPrefix(legacyKey) : "";
  const key =
    options?.plaintextKeyOverride ??
    (legacyKey.length > 0 ? maskLicenseKeyForApi(legacyKey) : prefix.length > 0 ? `${prefix}••••••` : "••••••••");
  return {
    id: String(row.id),
    name: (row.name as string) ?? (row.package_name as string) ?? "unknown-package",
    packageName: (row.package_name as string) ?? (row.name as string) ?? "unknown-package",
    key,
    plan: row.plan as License["plan"],
    keyMode: (row.key_mode as License["keyMode"]) ?? "dynamic",
    status: row.status as License["status"],
    assignedUser: (row.assigned_user as string | null) ?? null,
    deviceId: (row.device_id as string | null) ?? null,
    maxDevices: row.max_devices as number,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  };
}

function mockLicenseVisibleToAccount(lic: License, accountEmail: string): boolean {
  if (lic.ownerEmail) return lic.ownerEmail.toLowerCase() === accountEmail;
  const pkg = userPackages.find((p) => p.name === lic.packageName);
  return (pkg?.ownerEmail ?? "").toLowerCase() === accountEmail;
}

async function supabaseLicenseOwnedByAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  row: { owner_email?: string | null; package_name?: string | null },
  accountEmail: string
): Promise<boolean> {
  if (row.owner_email && String(row.owner_email).toLowerCase() === accountEmail) return true;
  if (row.owner_email) return false;
  const pkgName = row.package_name;
  if (!pkgName) return false;
  const { data: pkg } = await supabase.from("user_packages").select("owner_email").eq("name", pkgName).maybeSingle();
  return String(pkg?.owner_email ?? "").toLowerCase() === accountEmail;
}

export async function GET() {
  const session = await getWaSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const elevated = isLicenseElevatedRole(session.role);

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      let query = supabase.from("licenses").select("*").order("created_at", { ascending: false });
      if (!elevated) {
        query = query.eq("owner_email", session.email);
      }
      const { data, error } = await query;
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      const mapped = (data ?? []).map((row) => mapSupabaseRowToLicense(row as Record<string, unknown>));
      return NextResponse.json({ data: mapped });
    }
  }

  const list = elevated ? licenses : licenses.filter((lic) => mockLicenseVisibleToAccount(lic, session.email));
  return NextResponse.json({
    data: list.map(({ ownerEmail: _o, ...pub }) => ({
      ...pub,
      key: maskLicenseKeyForApi(pub.key),
    })),
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
  const session = await getWaSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const elevated = isLicenseElevatedRole(session.role);
  const { role, email } = session;

  const payload = await req.json();
  const parsed = CreateLicenseSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const computedExpiry = (() => {
    if (data.expiresAt) return data.expiresAt;
    const d = new Date();
    d.setDate(d.getDate() + (data.durationDays ?? 30));
    return d.toISOString();
  })();
  const normalizedPackageName = normalizePackageName(data.packageName);
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: packageDb } = await supabase
        .from("user_packages")
        .select("*")
        .eq("name", normalizedPackageName)
        .maybeSingle();
      if (!packageDb) {
        return NextResponse.json({ message: "Package not found. Please create package first." }, { status: 404 });
      }
      if (packageDb.status === "archived") {
        return NextResponse.json({ message: "Package is archived. Please activate package first." }, { status: 400 });
      }
      if (packageDb.token !== data.packageToken) {
        return NextResponse.json({ message: "Package token mismatch" }, { status: 403 });
      }
      if (!elevated && String(packageDb.owner_email ?? "").toLowerCase() !== email) {
        return NextResponse.json({ message: "Package belongs to another account" }, { status: 403 });
      }
    }
  } else {
    const packageRef = userPackages.find((pkg) => pkg.name === normalizedPackageName);
    if (!packageRef) {
      return NextResponse.json({ message: "Package not found. Please create package first." }, { status: 404 });
    }
    if (packageRef.status === "archived") {
      return NextResponse.json({ message: "Package is archived. Please activate package first." }, { status: 400 });
    }
    if (packageRef.token !== data.packageToken) {
      return NextResponse.json({ message: "Package token mismatch" }, { status: 403 });
    }
    if (!elevated && packageRef.ownerEmail.toLowerCase() !== email) {
      return NextResponse.json({ message: "Package belongs to another account" }, { status: 403 });
    }
  }
  const durationDays = data.durationDays ?? 30;
  if (role !== "owner") {
    const quota = await consumeKeyQuota(email, role, data.plan);
    if (!quota.ok) {
      return NextResponse.json({ message: quota.message }, { status: quota.status });
    }
  }
  const generatedKey = generatePackageBoundLicenseKey(normalizedPackageName, durationDays);
  const finalKey = data.keyMode === "static" ? data.key!.trim().toUpperCase() : generatedKey;

  if (!keyMatchesFormat(finalKey, normalizedPackageName, durationDays)) {
    return NextResponse.json(
      {
        message: `Invalid key format. Use: ${normalizedPackageName}-${durationDays}day-XXXXXX`,
      },
      { status: 400 }
    );
  }

  const newLicense: License = {
    id: `lic_${Date.now()}`,
    name: normalizedPackageName,
    packageName: normalizedPackageName,
    keyMode: data.keyMode,
    key: finalKey || generateLicenseKey(),
    plan: data.plan,
    status: data.status,
    assignedUser: data.assignedUser ?? null,
    deviceId: data.deviceId ?? null,
    maxDevices: data.maxDevices,
    createdAt: new Date().toISOString(),
    expiresAt: computedExpiry,
    lastUsedAt: null,
    ownerEmail: email,
  };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const pepper = getLicenseKeyPepper();
      const insertRow: Record<string, unknown> = {
        name: newLicense.name,
        package_name: newLicense.packageName,
        plan: newLicense.plan,
        key_mode: newLicense.keyMode,
        status: newLicense.status,
        assigned_user: newLicense.assignedUser,
        device_id: newLicense.deviceId,
        max_devices: newLicense.maxDevices,
        expires_at: newLicense.expiresAt,
        last_used_at: newLicense.lastUsedAt,
        owner_email: email,
      };
      if (pepper) {
        insertRow.key = null;
        insertRow.key_hash = hashLicenseKey(finalKey, pepper);
        insertRow.key_prefix = licenseKeyPrefix(finalKey);
      } else {
        insertRow.key = finalKey;
      }
      const { data: inserted, error } = await supabase.from("licenses").insert(insertRow).select("*").single();
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      return NextResponse.json(
        {
          data: mapSupabaseRowToLicense(inserted as Record<string, unknown>, { plaintextKeyOverride: finalKey }),
        },
        { status: 201 }
      );
    }
  }

  licenses.unshift(newLicense);
  const { ownerEmail: _omit, ...pub } = newLicense;
  return NextResponse.json({ data: pub }, { status: 201 });
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
  const session = await getWaSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const elevated = isLicenseElevatedRole(session.role);

  const ip = req.headers.get("x-forwarded-for") ?? "0.0.0.0";
  const payload = await req.json();
  const parsed = UpdateActionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const { id, action, days } = parsed.data;
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: current, error: currentErr } = await supabase.from("licenses").select("*").eq("id", id).maybeSingle();
      if (currentErr) return NextResponse.json({ message: currentErr.message }, { status: 500 });
      if (!current) return NextResponse.json({ message: "License not found" }, { status: 404 });

      if (!elevated && !(await supabaseLicenseOwnedByAccount(supabase, current, session.email))) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }

      let nextStatus = current.status as string;
      let nextExpires = current.expires_at;
      if (action === "ban") nextStatus = "banned";
      if (action === "revoke") nextStatus = "revoked";
      if (action === "unban") {
        if (current.status !== "banned") {
          return NextResponse.json({ message: "Key không ở trạng thái banned — không thể unban" }, { status: 400 });
        }
        nextStatus = "active";
      }
      if (action === "unrevoke") {
        if (current.status !== "revoked") {
          return NextResponse.json({ message: "Key không ở trạng thái revoked — không thể gỡ revoke" }, { status: 400 });
        }
        nextStatus = "active";
      }
      if (action === "activate") {
        if (current.status !== "inactive") {
          return NextResponse.json({ message: "Chỉ key inactive mới được kích hoạt lại (activate)" }, { status: 400 });
        }
        nextStatus = "active";
      }
      if (action === "deactivate") {
        if (current.status !== "active") {
          return NextResponse.json({ message: "Chỉ key active mới được tạm dừng (deactivate)" }, { status: 400 });
        }
        nextStatus = "inactive";
      }
      if (action === "extend") {
        const addDays = days ?? 7;
        const nowMs = Date.now();
        const expMs = current.expires_at ? new Date(current.expires_at).getTime() : nowMs;
        const base = new Date(Math.max(expMs, nowMs));
        base.setDate(base.getDate() + addDays);
        nextExpires = base.toISOString();
        if (current.status === "expired" || current.status === "inactive") {
          nextStatus = "active";
        }
      }

      const nowIso = new Date().toISOString();
      const { data: updated, error: updateErr } = await supabase
        .from("licenses")
        .update({ status: nextStatus, expires_at: nextExpires, updated_at: nowIso })
        .eq("id", id)
        .select("*")
        .single();
      if (updateErr) return NextResponse.json({ message: updateErr.message }, { status: 500 });

      await insertLicenseLog({
        licenseId: id,
        action,
        ip,
        metadata:
          action === "extend"
            ? { days: days ?? 7, previous_status: current.status }
            : { previous_status: current.status },
      });

      return NextResponse.json({ data: mapSupabaseRowToLicense(updated as Record<string, unknown>) });
    }
  }

  const license = licenses.find((l) => l.id === id);
  if (!license) return NextResponse.json({ message: "License not found" }, { status: 404 });

  if (!elevated && !mockLicenseVisibleToAccount(license, session.email)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (action === "ban") {
    license.status = "banned";
  } else if (action === "revoke") {
    license.status = "revoked";
  } else if (action === "unban") {
    if (license.status !== "banned") {
      return NextResponse.json({ message: "Key không ở trạng thái banned — không thể unban" }, { status: 400 });
    }
    license.status = "active";
  } else if (action === "unrevoke") {
    if (license.status !== "revoked") {
      return NextResponse.json({ message: "Key không ở trạng thái revoked — không thể gỡ revoke" }, { status: 400 });
    }
    license.status = "active";
  } else if (action === "activate") {
    if (license.status !== "inactive") {
      return NextResponse.json({ message: "Chỉ key inactive mới được kích hoạt lại (activate)" }, { status: 400 });
    }
    license.status = "active";
  } else if (action === "deactivate") {
    if (license.status !== "active") {
      return NextResponse.json({ message: "Chỉ key active mới được tạm dừng (deactivate)" }, { status: 400 });
    }
    license.status = "inactive";
  } else if (action === "extend") {
    const addDays = days ?? 7;
    const nowMs = Date.now();
    const expMs = license.expiresAt ? new Date(license.expiresAt).getTime() : nowMs;
    const base = new Date(Math.max(expMs, nowMs));
    base.setDate(base.getDate() + addDays);
    license.expiresAt = base.toISOString();
    if (license.status === "expired" || license.status === "inactive") {
      license.status = "active";
    }
  }
  licenseUsageLogs.push({
    id: `lug_${Date.now()}`,
    licenseId: license.id,
    action,
    ip,
    deviceId: license.deviceId,
    reason: action === "extend" ? `+${days ?? 7}d` : undefined,
    createdAt: new Date().toISOString(),
  });

  const { ownerEmail: _o, ...pub } = license;
  return NextResponse.json({ data: pub });
}

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
  const session = await getWaSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const elevated = isLicenseElevatedRole(session.role);

  const ip = req.headers.get("x-forwarded-for") ?? "0.0.0.0";
  const payload = await req.json();
  const parsed = DeleteLicenseSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = parsed.data;
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: current, error: curErr } = await supabase.from("licenses").select("*").eq("id", id).maybeSingle();
      if (curErr) return NextResponse.json({ message: curErr.message }, { status: 500 });
      if (!current) return NextResponse.json({ message: "License not found" }, { status: 404 });
      if (!elevated && !(await supabaseLicenseOwnedByAccount(supabase, current, session.email))) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }

      await insertLicenseLog({ licenseId: id, action: "delete", ip, metadata: { reason: "deleted_from_dashboard" } });
      const { data: deleted, error } = await supabase.from("licenses").delete().eq("id", id).select("*").maybeSingle();
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      if (!deleted) return NextResponse.json({ message: "License not found" }, { status: 404 });
      return NextResponse.json({ data: mapSupabaseRowToLicense(deleted as Record<string, unknown>) });
    }
  }

  const index = licenses.findIndex((l) => l.id === id);
  if (index < 0) return NextResponse.json({ message: "License not found" }, { status: 404 });
  const lic = licenses[index];
  if (!elevated && !mockLicenseVisibleToAccount(lic, session.email)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const [deleted] = licenses.splice(index, 1);
  licenseUsageLogs.push({
    id: `lug_${Date.now()}`,
    licenseId: deleted.id,
    action: "delete",
    ip,
    deviceId: deleted.deviceId,
    reason: "deleted_from_dashboard",
    createdAt: new Date().toISOString(),
  });

  const { ownerEmail: _od, ...pub } = deleted;
  return NextResponse.json({ data: { ...pub, key: maskLicenseKeyForApi(pub.key) } });
}
