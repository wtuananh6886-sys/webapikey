import { createHmac, timingSafeEqual } from "node:crypto";

type SessionClaims = {
  lid: string;
  did: string;
  /** format version */
  v: number;
  iat: number;
  exp: number;
};

function b64urlJson(obj: object) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function signSegment(segment: string, secret: string) {
  return createHmac("sha256", secret).update(segment).digest("base64url");
}

export function signLicenseSessionJwt(
  claims: { lid: string; did: string },
  secret: string,
  ttlSec: number
): string {
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlJson({
    lid: claims.lid,
    did: claims.did,
    v: 1,
    iat: now,
    exp: now + ttlSec,
  });
  const sig = signSegment(`${header}.${payload}`, secret);
  return `${header}.${payload}.${sig}`;
}

export function verifyLicenseSessionJwt(token: string, secret: string): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = signSegment(`${h}.${p}`, secret);
  const a = Buffer.from(s, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let body: unknown;
  try {
    body = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const lid = o.lid;
  const did = o.did;
  const v = o.v;
  const exp = o.exp;
  if (typeof lid !== "string" || typeof did !== "string" || v !== 1 || typeof exp !== "number") return null;
  if (exp * 1000 < Date.now()) return null;
  return { lid, did, v: 1, iat: typeof o.iat === "number" ? o.iat : 0, exp };
}

export function licenseSessionTtlSec(): number {
  const raw = process.env.LICENSE_SESSION_TTL_SEC;
  const n = raw ? parseInt(raw, 10) : 3600;
  if (!Number.isFinite(n) || n < 300 || n > 86400) return 3600;
  return n;
}

export function getLicenseSessionSecret(): string | null {
  const s = process.env.LICENSE_SESSION_SECRET?.trim();
  if (!s || s.length < 16) return null;
  return s;
}
