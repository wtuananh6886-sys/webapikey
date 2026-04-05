import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getWaSessionSecretBytes } from "@/lib/admin-session-jwt";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/forgot-password");
  const isProtected = pathname.startsWith("/dashboard");

  let hasSession = false;
  const secret = getWaSessionSecretBytes();
  const token = req.cookies.get("wa_session")?.value?.trim();
  if (secret && token) {
    try {
      await jwtVerify(token, secret, { algorithms: ["HS256"] });
      hasSession = true;
    } catch {
      hasSession = false;
    }
  }

  if (isProtected) {
    if (!hasSession) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (isAuthRoute && hasSession) {
    const url = new URL("/dashboard", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/forgot-password"],
};
