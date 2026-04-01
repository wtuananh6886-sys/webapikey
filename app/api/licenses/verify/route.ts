import { NextResponse } from "next/server";
import {
  getLicenseSessionSecret,
  licenseSessionTtlSec,
  signLicenseSessionJwt,
} from "@/lib/license-session-jwt";
import { getActivationBrandingByPackageName } from "@/lib/package-activation-ui";
import { licenses, licenseUsageLogs } from "@/lib/mock-data";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

type VerifyPayload = {
  licenseKey: string;
  deviceId: string;
  packageId?: string;
  packageToken?: string;
  appVersion?: string;
};

function normalizePackageName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const verifyRateMap = new Map<string, { count: number; resetAt: number }>();
const VERIFY_WINDOW_MS = 60_000;
const VERIFY_LIMIT = 45;

function checkRateLimit(identifier: string) {
  const now = Date.now();
  const current = verifyRateMap.get(identifier);
  if (!current || current.resetAt <= now) {
    verifyRateMap.set(identifier, { count: 1, resetAt: now + VERIFY_WINDOW_MS });
    return { limited: false };
  }
  current.count += 1;
  if (current.count > VERIFY_LIMIT) {
    return { limited: true, retryAfterSec: Math.ceil((current.resetAt - now) / 1000) };
  }
  return { limited: false };
}

async function insertVerifyLog(params: {
  licenseId: string;
  action: string;
  ip: string;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!isSupabaseEnabled()) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from("license_logs").insert({
    license_id: params.licenseId,
    action: params.action,
    ip_address: params.ip,
    user_agent: params.userAgent ?? null,
    metadata: params.metadata ?? {},
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VerifyPayload;
    const ip = req.headers.get("x-forwarded-for") ?? "0.0.0.0";
    const userAgent = req.headers.get("user-agent");
    const keyTag = body.licenseKey?.trim().slice(0, 20) ?? "unknown";
    const rateKey = `${ip}:${keyTag}`;
    const rate = checkRateLimit(rateKey);
    if (rate.limited) {
      return NextResponse.json({ ok: false, reason: "rate_limited", retryAfterSec: rate.retryAfterSec }, { status: 429 });
    }
    if (!body.licenseKey || !body.deviceId) {
      return NextResponse.json({ ok: false, reason: "missing_fields" }, { status: 400 });
    }

    const supabase = isSupabaseEnabled() ? getSupabaseAdminClient() : null;
    const lookupKey = body.licenseKey.trim();
    let license =
      licenses.find((it) => it.key === lookupKey) ?? null;
    if (supabase) {
      const { data } = await supabase.from("licenses").select("*").eq("key", lookupKey).maybeSingle();
      if (data) {
        license = {
          id: data.id,
          name: data.name ?? data.package_name ?? "unknown-package",
          packageName: data.package_name ?? data.name ?? "unknown-package",
          key: data.key,
          plan: data.plan,
          keyMode: data.key_mode ?? "dynamic",
          status: data.status,
          assignedUser: data.assigned_user,
          deviceId: data.device_id,
          maxDevices: data.max_devices,
          createdAt: data.created_at,
          expiresAt: data.expires_at,
          lastUsedAt: data.last_used_at,
        };
      }
    }
    if (!license) {
      licenseUsageLogs.push({
        id: `lug_${Date.now()}`,
        licenseId: "unknown",
        action: "verify_fail",
        ip,
        deviceId: body.deviceId ?? null,
        reason: "key_not_found",
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: false, reason: "key_not_found" }, { status: 404 });
    }
    if (license.status !== "active") {
      licenseUsageLogs.push({
        id: `lug_${Date.now()}`,
        licenseId: license.id,
        action: "verify_fail",
        ip,
        deviceId: body.deviceId ?? null,
        reason: `status_${license.status}`,
        createdAt: new Date().toISOString(),
      });
      await insertVerifyLog({
        licenseId: license.id,
        action: "verify_fail",
        ip,
        userAgent,
        metadata: { reason: `status_${license.status}` },
      });
      return NextResponse.json({ ok: false, reason: `status_${license.status}` }, { status: 403 });
    }
    if (new Date(license.expiresAt).getTime() < Date.now()) {
      licenseUsageLogs.push({
        id: `lug_${Date.now()}`,
        licenseId: license.id,
        action: "verify_fail",
        ip,
        deviceId: body.deviceId ?? null,
        reason: "expired",
        createdAt: new Date().toISOString(),
      });
      await insertVerifyLog({
        licenseId: license.id,
        action: "verify_fail",
        ip,
        userAgent,
        metadata: { reason: "expired" },
      });
      return NextResponse.json({ ok: false, reason: "expired" }, { status: 403 });
    }

    const normalizedLicensePackage = normalizePackageName(license.packageName ?? "");
    if (body.packageId && normalizedLicensePackage && normalizedLicensePackage !== normalizePackageName(body.packageId)) {
      licenseUsageLogs.push({
        id: `lug_${Date.now()}`,
        licenseId: license.id,
        action: "verify_fail",
        ip,
        deviceId: body.deviceId ?? null,
        reason: "package_mismatch",
        createdAt: new Date().toISOString(),
      });
      await insertVerifyLog({
        licenseId: license.id,
        action: "verify_fail",
        ip,
        userAgent,
        metadata: { reason: "package_mismatch", expectedPackage: license.packageName, receivedPackage: body.packageId },
      });
      return NextResponse.json(
        {
          ok: false,
          reason: "package_mismatch",
          expectedPackage: license.packageName,
          receivedPackage: body.packageId,
        },
        { status: 403 }
      );
    }

    let resolvedPackageToken: string | null = null;
    if (supabase) {
      const { data: pkg } = await supabase
        .from("user_packages")
        .select("token")
        .eq("name", license.packageName)
        .maybeSingle();
      resolvedPackageToken = pkg?.token ?? null;
    } else {
      const { userPackages } = await import("@/lib/mock-data");
      resolvedPackageToken = userPackages.find((pkg) => pkg.name === license.packageName)?.token ?? null;
    }
    if (!resolvedPackageToken) {
      return NextResponse.json({ ok: false, reason: "package_token_not_configured" }, { status: 500 });
    }
    if (!body.packageToken || body.packageToken !== resolvedPackageToken) {
      await insertVerifyLog({
        licenseId: license.id,
        action: "verify_fail",
        ip,
        userAgent,
        metadata: { reason: "package_token_mismatch" },
      });
      return NextResponse.json({ ok: false, reason: "package_token_mismatch" }, { status: 403 });
    }

    if (license.deviceId && license.deviceId !== body.deviceId) {
      licenseUsageLogs.push({
        id: `lug_${Date.now()}`,
        licenseId: license.id,
        action: "verify_fail",
        ip,
        deviceId: body.deviceId ?? null,
        reason: "device_mismatch",
        createdAt: new Date().toISOString(),
      });
      await insertVerifyLog({
        licenseId: license.id,
        action: "verify_fail",
        ip,
        userAgent,
        metadata: { reason: "device_mismatch", expectedDeviceId: license.deviceId, receivedDeviceId: body.deviceId },
      });
      return NextResponse.json({ ok: false, reason: "device_mismatch" }, { status: 403 });
    }

    // First bind if key is not linked to a device yet.
    if (!license.deviceId) {
      license.deviceId = body.deviceId;
    }
    license.lastUsedAt = new Date().toISOString();
    if (supabase) {
      await supabase
        .from("licenses")
        .update({ device_id: license.deviceId, last_used_at: license.lastUsedAt })
        .eq("id", license.id);
    }

    licenseUsageLogs.push({
      id: `lug_${Date.now()}`,
      licenseId: license.id,
      action: "verify_ok",
      ip,
      deviceId: body.deviceId ?? null,
      createdAt: new Date().toISOString(),
    });
    await insertVerifyLog({
      licenseId: license.id,
      action: "verify_ok",
      ip,
      userAgent,
      metadata: { packageId: body.packageId ?? null, appVersion: body.appVersion ?? null },
    });

    const sessionSecret = getLicenseSessionSecret();
    const ttl = licenseSessionTtlSec();
    const sessionToken =
      sessionSecret ? signLicenseSessionJwt({ lid: license.id, did: body.deviceId }, sessionSecret, ttl) : undefined;

    const branding = await getActivationBrandingByPackageName(license.packageName ?? "");

    return NextResponse.json({
      ok: true,
      plan: license.plan,
      packageName: license.packageName,
      expiresAt: license.expiresAt,
      uiTitle: branding.uiTitle,
      uiSubtitle: branding.uiSubtitle,
      ...(sessionToken
        ? { sessionToken, sessionExpiresInSec: ttl, sessionHint: "POST /api/licenses/session with Bearer before expiry" }
        : {}),
      featureFlags: {
        allowAimAssist: true,
        allowSkinBypass: license.plan !== "basic",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: "server_error", message: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 }
    );
  }
}
