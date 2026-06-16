// ============================================================
// AERIE — route protection
// Authentication is always required (generic OIDC, or the local
// credentials/setup flow when OIDC is off). Unauthenticated requests
// are redirected to /login; admin-only routes are re-checked here as
// defence in depth (also enforced server-side in the page).
// ============================================================
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  // Public metadata routes (favicon, social share cards) must be reachable
  // without a session — browser tabs on /login and social scrapers fetch them.
  const isBrandAsset =
    pathname === "/icon.svg" ||
    pathname === "/apple-icon" ||
    pathname === "/opengraph-image" ||
    pathname === "/twitter-image" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/icon-192.png" ||
    pathname === "/icon-512.png" ||
    pathname === "/icon-maskable.png";
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/api/auth") || isBrandAsset;
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
