import { NextResponse } from "next/server";
import { adminCredentials } from "@/lib/mock-data";

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
  const response = NextResponse.json({ ok: true });
  response.cookies.set("wa_role", role, { httpOnly: true, path: "/" });
  response.cookies.set("wa_email", email.toLowerCase(), { httpOnly: true, path: "/" });
  return response;
}
