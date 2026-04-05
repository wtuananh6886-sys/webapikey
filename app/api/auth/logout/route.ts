import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("wa_session", "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "lax" });
  res.cookies.set("wa_role", "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set("wa_email", "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set("wa_username", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
