import { NextResponse } from "next/server";
import { ensureAccountPolicyOnLogin } from "@/lib/account-policy";
import { adminCredentials } from "@/lib/mock-data";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string; identifier?: string; password?: string };
  const raw = (body.identifier ?? body.email ?? "").trim();
  const password = body.password ?? "";
  if (!raw || !password) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });

  const key = raw.toLowerCase();
  const account = adminCredentials.find(
    (it) =>
      (it.email.toLowerCase() === key || it.username.toLowerCase() === key) && it.password === password
  );
  if (!account) {
    return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
  }
  const role = account.role;
  const emailNorm = account.email.toLowerCase();
  const username = account.username.trim();

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      try {
        await ensureAccountPolicyOnLogin(supabase, emailNorm, role);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "policy_sync_failed";
        return NextResponse.json({ message: msg }, { status: 500 });
      }
    }
  }

  const response = NextResponse.json({ ok: true, email: emailNorm, username });
  response.cookies.set("wa_role", role, { httpOnly: true, path: "/" });
  response.cookies.set("wa_email", emailNorm, { httpOnly: true, path: "/" });
  response.cookies.set("wa_username", username, { httpOnly: true, path: "/" });
  return response;
}
