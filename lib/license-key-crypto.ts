import { createHash } from "node:crypto";

/** Pepper must come from env (see LICENSE_KEY_PEPPER or WA_SESSION_SECRET in getLicenseKeyPepper). */
export function hashLicenseKey(plainKey: string, pepper: string): string {
  const norm = plainKey.trim();
  return createHash("sha256").update(pepper, "utf8").update("\0", "utf8").update(norm, "utf8").digest("hex");
}

export function licenseKeyPrefix(plainKey: string, visibleLen = 10): string {
  const t = plainKey.trim();
  return t.slice(0, Math.min(visibleLen, t.length));
}

/**
 * Shared secret for hashing license keys at rest. Prefer LICENSE_KEY_PEPPER; else WA_SESSION_SECRET.
 * Empty string means hashing disabled (legacy plaintext column only — not for production).
 */
export function getLicenseKeyPepper(): string {
  const p = process.env.LICENSE_KEY_PEPPER?.trim() || process.env.WA_SESSION_SECRET?.trim();
  if (!p || p.length < 16) return "";
  return p;
}

export function maskLicenseKeyForApi(fullOrPrefix: string): string {
  const t = fullOrPrefix.trim();
  if (!t) return "••••••••";
  if (t.length <= 6) return "••••••••";
  return `${t.slice(0, 4)}••••${t.slice(-2)}`;
}
