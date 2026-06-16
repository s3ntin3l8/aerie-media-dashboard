import { describe, it, expect, vi } from "vitest";

// auth() is a higher-order wrapper; mock it to the identity so we can call the
// route-protection handler directly with a synthetic request.
vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }));

import middleware from "@/proxy";

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

  it.each(["/login", "/login/setup", "/api/auth/callback/oidc"])(
    "%s stays public (auth flow)",
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
