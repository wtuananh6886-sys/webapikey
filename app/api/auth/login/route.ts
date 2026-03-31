import { NextResponse } from "next/server";
import { ensureAccountPolicyOnLogin } from "@/lib/account-policy";
import { adminCredentials } from "@/lib/mock-data";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email: string; password: string };
  if (!email || !password) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });

  const account = adminCredentials.find(
    (it) => it.email.toLowerCase() === email.toLowerCase().trim() && it.password === password
  );
  if (!account) {
    return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
  }
  const role = account.role;
  const emailNorm = email.toLowerCase().trim();

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

  const response = NextResponse.json({ ok: true });
  response.cookies.set("wa_role", role, { httpOnly: true, path: "/" });
  response.cookies.set("wa_email", emailNorm, { httpOnly: true, path: "/" });
  return response;
}
