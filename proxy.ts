// ============================================================
// AERIE — route protection
// When Authentik OIDC is configured, unauthenticated requests are
// redirected to /login. When it isn't (dev/mock), all routes pass.
// Admin-only routes are additionally re-checked server-side.
// ============================================================
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authConfigured } from "@/lib/env";

export default auth((req) => {
  if (!authConfigured) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/api/auth");
  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(url);
  }

  // Admin-only area (defence in depth — also checked in the page).
  if (pathname.startsWith("/admin") && req.auth.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Run on everything except Next internals and static font/image assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.woff2$).*)"],
};
