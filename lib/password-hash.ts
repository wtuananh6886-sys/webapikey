import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;

/**
 * Format: scrypt$<salt_hex>$<hash_hex>
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain: string, encoded: string): boolean {
  const trimmed = encoded.trim();
  const [algo, salt, expectedHex] = trimmed.split("$");
  if (algo !== "scrypt" || !salt || !expectedHex) return false;
  const actual = scryptSync(plain, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
