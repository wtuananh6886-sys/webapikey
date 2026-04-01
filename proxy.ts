import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { dashboardPathAllowed, parseRoleCookie } from "@/lib/dashboard-path-policy";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");
  const isProtected = pathname.startsWith("/dashboard");
  const role = parseRoleCookie(req.cookies.get("wa_role")?.value);

  if (isProtected) {
    if (!role) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (!dashboardPathAllowed(role, pathname)) {
      const url = new URL("/dashboard", req.url);
      url.searchParams.set("forbidden", "1");
      return NextResponse.redirect(url);
    }
  }

  if (isAuthRoute && role) {
    const url = new URL("/dashboard", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
