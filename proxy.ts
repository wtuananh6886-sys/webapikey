import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  const isProtected = pathname.startsWith("/dashboard");
  const role = req.cookies.get("wa_role")?.value;

  if (isProtected && !role) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && role) {
    const url = new URL("/dashboard", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
