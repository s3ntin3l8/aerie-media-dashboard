// ============================================================
// AERIE — route protection
// Authentication is always required (generic OIDC, or the local
// credentials/setup flow when OIDC is off). Unauthenticated requests
// are redirected to /login; admin-only routes are re-checked here as
// defence in depth (also enforced server-side in the page).
// ============================================================
import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Build the CSP for a request, binding script execution to the per-request `nonce`.
 * `script-src` uses `'strict-dynamic'` with no `'unsafe-inline'` and no host allowlist: the nonce'd
 * Next.js bootstrap propagates trust to the chunks it loads, which is stricter than allowlisting
 * `'self'`, and we intentionally skip the `'unsafe-inline'`/`https:` fallback that only benefits
 * pre-CSP3 browsers. `worker-src 'self'` is explicit because ServiceWorkerRegister swallows a failed
 * `/sw.js` registration, so a CSP block there would be silent. `style-src`/`connect-src`/`frame-src`
 * are left unset so the app's inline styles, remote API loads, and service iframes are unconstrained
 * (unchanged from before). HSTS is added at the reverse proxy.
 */
function cspFor(nonce: string): string {
  return [
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/** Apply the standard security headers (CSP bound to `nonce`) to every outgoing response. */
function withSecurityHeaders(res: NextResponse, nonce: string): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Content-Security-Policy", cspFor(nonce));
  return res;
}

/**
 * Pass-through response that forwards the nonce to the render. Next.js reads the nonce from the
 * request-side `Content-Security-Policy` header and injects it into its own bootstrap/framework
 * `<script>` tags; the root layout reads `x-nonce` (via `headers()`) for our inline theme script.
 */
function passThrough(req: Parameters<Parameters<typeof auth>[0]>[0], nonce: string): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspFor(nonce));
  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  // Per-request nonce that locks down script-src (see cspFor). Fresh per request so it can't be
  // replayed; base64 of a random UUID is a valid CSP nonce token.
  const nonce = btoa(crypto.randomUUID());
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
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/health" ||
    isBrandAsset;
  // Security headers apply to every route — including the login form — so that
  // /login itself is protected against clickjacking and MIME-sniffing attacks.
  if (isPublic) return passThrough(req, nonce);

  if (!req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    return withSecurityHeaders(NextResponse.redirect(url), nonce);
  }

  // Admin-only area (defence in depth — also checked in the page).
  if (pathname.startsWith("/admin") && req.auth.user?.role !== "admin") {
    return withSecurityHeaders(NextResponse.redirect(new URL("/", req.nextUrl.origin)), nonce);
  }

  return passThrough(req, nonce);
});

export const config = {
  // Run on everything except Next internals and static font/image assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.woff2$).*)"],
};
