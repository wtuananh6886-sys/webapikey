import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email: string; password: string };
  if (!email || !password) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });

  // Mock auth. Replace with Supabase Auth in production.
  const role = email.includes("support") ? "support" : email.includes("admin") ? "admin" : "owner";
  const response = NextResponse.json({ ok: true });
  response.cookies.set("wa_role", role, { httpOnly: true, path: "/" });
  response.cookies.set("wa_email", email.toLowerCase(), { httpOnly: true, path: "/" });
  return response;
}
