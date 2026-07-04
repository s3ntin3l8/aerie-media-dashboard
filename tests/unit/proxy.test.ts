import { describe, it, expect, vi } from "vitest";

// auth() is a higher-order wrapper; mock it to the identity so we can call the
// route-protection handler directly with a synthetic request.
vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }));

import middleware from "@/middleware";

type Auth = { user?: { role?: string } } | null;
const handler = middleware as unknown as (req: unknown) => Response;
const ORIGIN = "http://localhost:3000";
const run = (pathname: string, auth: Auth = null) =>
  handler({ nextUrl: { pathname, origin: ORIGIN }, auth });

const isPassThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";
const redirectedTo = (res: Response) => (res.status === 307 ? res.headers.get("location") : null);

describe("proxy middleware — public asset exemptions (PWA)", () => {
  // The brand/PWA assets must be reachable WITHOUT a session: install scrapers,
  // the SW, and /login tabs all fetch them before auth.
  it.each([
    "/manifest.webmanifest",
    "/sw.js",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable.png",
    "/icon.svg",
    "/apple-icon",
    "/opengraph-image",
    "/twitter-image",
  ])("%s is public when unauthenticated", (path) => {
    const res = run(path, null);
    expect(isPassThrough(res)).toBe(true);
    expect(redirectedTo(res)).toBeNull();
  });

  it.each(["/login", "/login/setup", "/api/auth/callback/oidc", "/api/health"])(
    "%s stays public (auth flow / health probe)",
    (path) => {
      expect(isPassThrough(run(path, null))).toBe(true);
    },
  );
});

describe("proxy middleware — auth gate still enforced", () => {
  it.each(["/", "/status", "/icon-999.png", "/manifest.json"])(
    "redirects unauthenticated %s to /login",
    (path) => {
      expect(redirectedTo(run(path, null))).toBe(`${ORIGIN}/login`);
    },
  );

  it("lets an authenticated user through to a normal route", () => {
    expect(isPassThrough(run("/", { user: { role: "user" } }))).toBe(true);
  });

  it("bounces a non-admin off /admin to the home route", () => {
    expect(redirectedTo(run("/admin", { user: { role: "user" } }))).toBe(`${ORIGIN}/`);
  });

  it("lets an admin into /admin", () => {
    expect(isPassThrough(run("/admin", { user: { role: "admin" } }))).toBe(true);
  });
});

describe("proxy middleware — security response headers", () => {
  // Headers must be present on ALL responses: authenticated, unauthenticated,
  // public routes, and auth redirects — so the /login form is also protected
  // against clickjacking and MIME-sniffing attacks.

  it.each([
    ["authenticated pass-through", () => run("/", { user: { role: "user" } })],
    ["public /login (unauthenticated)", () => run("/login", null)],
    ["brand asset /sw.js (unauthenticated)", () => run("/sw.js", null)],
    ["unauthenticated redirect to /login", () => run("/", null)],
    ["admin redirect to /", () => run("/admin", { user: { role: "user" } })],
  ] as const)("sets X-Frame-Options on %s", (_label, getRes) => {
    expect(getRes().headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it.each([
    ["authenticated pass-through", () => run("/", { user: { role: "user" } })],
    ["public /login (unauthenticated)", () => run("/login", null)],
  ] as const)("sets the full header set on %s", (_label, getRes) => {
    const res = getRes();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    // CSP: script-src locked to a per-request nonce + strict-dynamic; the baseline
    // object/base/frame-ancestors/worker directives are still present. iframe embedding and remote
    // API loads stay unconstrained (no frame-src/connect-src).
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("mints a fresh script-src nonce per request", () => {
    const nonceOf = (res: Response) =>
      (res.headers.get("content-security-policy") ?? "").match(/'nonce-([^']+)'/)?.[1];
    const a = nonceOf(run("/login", null));
    const b = nonceOf(run("/login", null));
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
