import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { defaultLimitsForRole, ensureAccountPolicyRow, monthTag } from "@/lib/account-policy";
import { accountPolicies, licenses, licenseUsageLogs, userPackages } from "@/lib/mock-data";
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
  action: z.enum(["ban", "revoke", "extend"]),
  days: z.number().int().min(1).max(365).optional(),
});

const DeleteLicenseSchema = z.object({
  id: z.string(),
});

function generateLicenseKey() {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
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
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < 6; i += 1) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${normalized}-${durationDays}day-${token}`;
}

function keyMatchesFormat(key: string, packageName: string, durationDays: number) {
  const normalizedPackage = normalizePackageName(packageName);
  const pattern = new RegExp(`^${normalizedPackage}-${durationDays}day-[A-Z0-9]{6}$`);
  return pattern.test(key);
}

function parseRole(raw: string | undefined): Role {
  if (raw === "owner" || raw === "admin" || raw === "support" || raw === "viewer") return raw;
  return "viewer";
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

export async function GET() {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase.from("licenses").select("*").order("created_at", { ascending: false });
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      const mapped = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name ?? row.package_name ?? "unknown-package",
        packageName: row.package_name ?? row.name ?? "unknown-package",
        key: row.key,
        plan: row.plan,
        keyMode: row.key_mode ?? "dynamic",
        status: row.status,
        assignedUser: row.assigned_user,
        deviceId: row.device_id,
        maxDevices: row.max_devices,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
      } satisfies License));
      return NextResponse.json({ data: mapped });
    }
  }
  return NextResponse.json({ data: licenses });
}

export async function POST(req: Request) {
  const payload = await req.json();
  const parsed = CreateLicenseSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const cookieStore = await cookies();
  const role = cookieStore.get("wa_role")?.value ?? "viewer";
  const email = (cookieStore.get("wa_email")?.value ?? "viewer@local").toLowerCase();
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
  }
  const durationDays = data.durationDays ?? 30;
  if (!(role === "owner" || role === "admin")) {
    const quota = await consumeKeyQuota(email, parseRole(role), data.plan);
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
  };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data: inserted, error } = await supabase
        .from("licenses")
        .insert({
          name: newLicense.name,
          package_name: newLicense.packageName,
          key: newLicense.key,
          plan: newLicense.plan,
          key_mode: newLicense.keyMode,
          status: newLicense.status,
          assigned_user: newLicense.assignedUser,
          device_id: newLicense.deviceId,
          max_devices: newLicense.maxDevices,
          expires_at: newLicense.expiresAt,
          last_used_at: newLicense.lastUsedAt,
        })
        .select("*")
        .single();
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      return NextResponse.json(
        {
          data: {
            id: inserted.id,
            name: inserted.name ?? inserted.package_name,
            packageName: inserted.package_name ?? inserted.name,
            key: inserted.key,
            plan: inserted.plan,
            keyMode: inserted.key_mode ?? "dynamic",
            status: inserted.status,
            assignedUser: inserted.assigned_user,
            deviceId: inserted.device_id,
            maxDevices: inserted.max_devices,
            createdAt: inserted.created_at,
            expiresAt: inserted.expires_at,
            lastUsedAt: inserted.last_used_at,
          } satisfies License,
        },
        { status: 201 }
      );
    }
  }

  licenses.unshift(newLicense);
  return NextResponse.json({ data: newLicense }, { status: 201 });
}

export async function PATCH(req: Request) {
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

      let nextStatus = current.status;
      let nextExpires = current.expires_at;
      if (action === "ban") nextStatus = "banned";
      if (action === "revoke") nextStatus = "revoked";
      if (action === "extend") {
        const base = new Date(current.expires_at || new Date());
        base.setDate(base.getDate() + (days ?? 7));
        nextExpires = base.toISOString();
      }

      const { data: updated, error: updateErr } = await supabase
        .from("licenses")
        .update({ status: nextStatus, expires_at: nextExpires })
        .eq("id", id)
        .select("*")
        .single();
      if (updateErr) return NextResponse.json({ message: updateErr.message }, { status: 500 });

      await insertLicenseLog({
        licenseId: id,
        action,
        ip,
        metadata: action === "extend" ? { days: days ?? 7 } : {},
      });

      return NextResponse.json({
        data: {
          id: updated.id,
          name: updated.name ?? updated.package_name,
          packageName: updated.package_name ?? updated.name,
          key: updated.key,
          plan: updated.plan,
          keyMode: updated.key_mode ?? "dynamic",
          status: updated.status,
          assignedUser: updated.assigned_user,
          deviceId: updated.device_id,
          maxDevices: updated.max_devices,
          createdAt: updated.created_at,
          expiresAt: updated.expires_at,
          lastUsedAt: updated.last_used_at,
        } satisfies License,
      });
    }
  }

  const license = licenses.find((l) => l.id === id);
  if (!license) return NextResponse.json({ message: "License not found" }, { status: 404 });

  if (action === "ban") {
    license.status = "banned";
  } else if (action === "revoke") {
    license.status = "revoked";
  } else if (action === "extend") {
    const base = new Date(license.expiresAt || new Date());
    base.setDate(base.getDate() + (days ?? 7));
    license.expiresAt = base.toISOString();
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

  return NextResponse.json({ data: license });
}

export async function DELETE(req: Request) {
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
      const { data: deleted, error } = await supabase.from("licenses").delete().eq("id", id).select("*").maybeSingle();
      if (error) return NextResponse.json({ message: error.message }, { status: 500 });
      if (!deleted) return NextResponse.json({ message: "License not found" }, { status: 404 });
      await insertLicenseLog({ licenseId: id, action: "delete", ip, metadata: { reason: "deleted_from_dashboard" } });
      return NextResponse.json({
        data: {
          id: deleted.id,
          name: deleted.name ?? deleted.package_name,
          packageName: deleted.package_name ?? deleted.name,
          key: deleted.key,
          plan: deleted.plan,
          keyMode: deleted.key_mode ?? "dynamic",
          status: deleted.status,
          assignedUser: deleted.assigned_user,
          deviceId: deleted.device_id,
          maxDevices: deleted.max_devices,
          createdAt: deleted.created_at,
          expiresAt: deleted.expires_at,
          lastUsedAt: deleted.last_used_at,
        } satisfies License,
      });
    }
  }

  const index = licenses.findIndex((l) => l.id === id);
  if (index < 0) return NextResponse.json({ message: "License not found" }, { status: 404 });
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

  return NextResponse.json({ data: deleted });
}
