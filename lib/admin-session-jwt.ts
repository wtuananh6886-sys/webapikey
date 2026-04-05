import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@/types/domain";

const MIN_SECRET_LEN = 16;

export function getWaSessionSecretBytes(): Uint8Array | null {
  const s = process.env.WA_SESSION_SECRET?.trim();
  if (!s || s.length < MIN_SECRET_LEN) return null;
  return new TextEncoder().encode(s);
}

export function waSessionTtlSec(): number {
  const raw = process.env.WA_SESSION_TTL_SEC;
  const n = raw ? parseInt(raw, 10) : 60 * 60 * 24 * 7;
  if (!Number.isFinite(n) || n < 300 || n > 60 * 60 * 24 * 30) return 60 * 60 * 24 * 7;
  return n;
}

function isRole(v: unknown): v is Role {
  return v === "owner" || v === "admin" || v === "support" || v === "viewer";
}

export async function signWaSessionJwt(
  params: { email: string; role: Role; username: string },
  secret: Uint8Array,
  ttlSec: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: params.role, username: params.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.email.toLowerCase())
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .sign(secret);
}

export type WaSessionClaims = { email: string; role: Role; username: string };

export async function verifyWaSessionJwt(token: string, secret: Uint8Array): Promise<WaSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return parseWaPayload(payload);
  } catch {
    return null;
  }
}

/** Edge middleware: decode role without full verify when secret missing is unsafe — caller must verify. */
export function parseWaPayload(payload: JWTPayload): WaSessionClaims | null {
  const email = typeof payload.sub === "string" ? payload.sub.trim().toLowerCase() : "";
  if (!email) return null;
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  if (!username) return null;
  if (!isRole(payload.role)) return null;
  return { email, role: payload.role, username };
}
