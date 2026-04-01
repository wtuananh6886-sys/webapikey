import { NextResponse } from "next/server";
import { z } from "zod";
import { getActivationBrandingByPackageToken } from "@/lib/package-activation-ui";

const BodySchema = z.object({
  packageToken: z.string().min(8).max(200),
});

const rateMap = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 60;

function checkRateLimit(key: string) {
  const now = Date.now();
  const cur = rateMap.get(key);
  if (!cur || cur.resetAt <= now) {
    rateMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false as const };
  }
  cur.count += 1;
  if (cur.count > LIMIT) {
    return { limited: true as const, retryAfterSec: Math.ceil((cur.resetAt - now) / 1000) };
  }
  return { limited: false as const };
}

/** Public (token-only) branding for in-tweak activation screen. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "0.0.0.0";
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 400 });
  }

  const rate = checkRateLimit(`${ip}:${parsed.data.packageToken.slice(0, 12)}`);
  if (rate.limited) {
    return NextResponse.json({ ok: false, reason: "rate_limited", retryAfterSec: rate.retryAfterSec }, { status: 429 });
  }

  const branding = await getActivationBrandingByPackageToken(parsed.data.packageToken);
  if (!branding) {
    return NextResponse.json({ ok: false, reason: "unknown_token" }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, uiTitle: branding.uiTitle, uiSubtitle: branding.uiSubtitle },
    { headers: { "Cache-Control": "no-store" } }
  );
}
