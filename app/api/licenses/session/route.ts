import { NextResponse } from "next/server";
import { licenses } from "@/lib/mock-data";
import {
  getLicenseSessionSecret,
  licenseSessionTtlSec,
  signLicenseSessionJwt,
  verifyLicenseSessionJwt,
} from "@/lib/license-session-jwt";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

type LicenseShape = {
  id: string;
  packageName: string;
  plan: string;
  status: string;
  deviceId: string | null;
  expiresAt: string;
};

async function loadLicenseById(id: string): Promise<LicenseShape | null> {
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase.from("licenses").select("*").eq("id", id).maybeSingle();
      if (error || !data) return null;
      return {
        id: data.id,
        packageName: data.package_name ?? data.name ?? "",
        plan: data.plan,
        status: data.status,
        deviceId: data.device_id ?? null,
        expiresAt: data.expires_at,
      };
    }
  }
  const lic = licenses.find((l) => l.id === id);
  if (!lic) return null;
  return {
    id: lic.id,
    packageName: lic.packageName,
    plan: lic.plan,
    status: lic.status,
    deviceId: lic.deviceId,
    expiresAt: lic.expiresAt,
  };
}

/**
 * Refresh short-lived session after initial verify. Client should call on a timer (e.g. every 15–30 min).
 * Does not replace license key + packageToken on first activation — only extends server-backed validity.
 */
export async function POST(req: Request) {
  const secret = getLicenseSessionSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, reason: "session_disabled", message: "Set LICENSE_SESSION_SECRET (16+ chars) to enable." },
      { status: 503 }
    );
  }

  let token: string | null = null;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) token = auth.slice(7).trim();
  if (!token) {
    try {
      const body = (await req.json()) as { sessionToken?: string };
      token = body.sessionToken?.trim() ?? null;
    } catch {
      /* empty body */
    }
  }
  if (!token) {
    return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 400 });
  }

  const claims = verifyLicenseSessionJwt(token, secret);
  if (!claims) {
    return NextResponse.json({ ok: false, reason: "invalid_or_expired_session" }, { status: 401 });
  }

  const license = await loadLicenseById(claims.lid);
  if (!license) {
    return NextResponse.json({ ok: false, reason: "license_revoked" }, { status: 401 });
  }
  if (license.status !== "active") {
    return NextResponse.json({ ok: false, reason: `status_${license.status}` }, { status: 403 });
  }
  if (new Date(license.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, reason: "expired" }, { status: 403 });
  }
  if (license.deviceId && license.deviceId !== claims.did) {
    return NextResponse.json({ ok: false, reason: "device_mismatch" }, { status: 403 });
  }

  const ttl = licenseSessionTtlSec();
  const sessionToken = signLicenseSessionJwt({ lid: license.id, did: claims.did }, secret, ttl);

  return NextResponse.json({
    ok: true,
    plan: license.plan,
    packageName: license.packageName,
    expiresAt: license.expiresAt,
    sessionExpiresInSec: ttl,
    sessionToken,
    featureFlags: {
      allowAimAssist: true,
      allowSkinBypass: license.plan !== "basic",
    },
  });
}
