import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// The route resolves credentials from the registry (server-only, DB-backed). Stub it so the
// test exercises only URL construction + the SSRF origin guard, with no DB.
vi.mock("@/lib/integrations/registry", () => ({
  getServiceSecret: vi.fn(), getServiceCredentials: vi.fn(),
}));
// The route now gates on a live session; stub auth() so most tests run "authenticated".
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { GET, isPlainPath, isTautulliRef } from "@/app/api/artwork/route";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { auth } from "@/auth";

// Default every test to an authenticated session; the 401 test overrides this.
beforeEach(() => {
  vi.mocked(auth).mockResolvedValue({ user: { role: "user" } } as never);
});

const mockCreds = (creds: { baseUrl: string; apiKey: string | null } | null) =>
  vi.mocked(getServiceCredentials).mockResolvedValue(creds as never);

// The handler only reads req.nextUrl.searchParams, so a URL-backed stub is enough.
const req = (qs: string): NextRequest =>
  ({ nextUrl: new URL(`http://localhost/api/artwork?${qs}`) }) as unknown as NextRequest;

describe("isPlainPath", () => {
  it("accepts a plain absolute path (incl. a query string)", () => {
    expect(isPlainPath("/MediaCover/15/poster.jpg")).toBe(true);
    expect(isPlainPath("/b8VtW6I.jpg?lastWrite=123")).toBe(true);
  });

  it("rejects protocol-relative, backslash, and non-absolute refs", () => {
    expect(isPlainPath("//evil.com/x.jpg")).toBe(false);
    expect(isPlainPath("/a\\b")).toBe(false);
    expect(isPlainPath("evil.com")).toBe(false);
    expect(isPlainPath("")).toBe(false);
  });
});

describe("isTautulliRef", () => {
  it("accepts a plain Plex image path", () => {
    expect(isTautulliRef("/library/metadata/123/thumb/456")).toBe(true);
  });

  it("accepts an https plex.tv host (user_thumb avatars)", () => {
    expect(isTautulliRef("https://plex.tv/users/abc/avatar")).toBe(true);
    expect(isTautulliRef("https://i2.wp.plex.tv/x.png")).toBe(true);
  });

  it("rejects internal/external SSRF targets", () => {
    expect(isTautulliRef("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isTautulliRef("http://192.168.1.1/")).toBe(false);
    expect(isTautulliRef("https://evil.com/x.png")).toBe(false);
    expect(isTautulliRef("https://plex.tv.evil.com/x.png")).toBe(false);
    expect(isTautulliRef("//evil.com/x.png")).toBe(false);
  });
});

describe("GET /api/artwork", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await GET(req("svc=jellyfin&ref=abc"))).status).toBe(401);
  });

  it("blocks a tautulli ref aimed at an internal host (SSRF) with 400", async () => {
    mockCreds({ baseUrl: "https://tautulli.local", apiKey: "k" });
    const res = await GET(req("svc=tautulli&ref=" + encodeURIComponent("http://169.254.169.254/")));
    expect(res.status).toBe(400);
  });

  it("returns 400 when svc or ref is missing", async () => {
    expect((await GET(req("svc=jellyfin"))).status).toBe(400);
    expect((await GET(req("ref=/x.jpg"))).status).toBe(400);
  });

  it("returns 404 for an unknown service", async () => {
    mockCreds(null);
    expect((await GET(req("svc=nope&ref=/x.jpg"))).status).toBe(404);
  });

  it("returns 400 when the ref is rejected (protocol-relative path)", async () => {
    mockCreds({ baseUrl: "https://sonarr.local", apiKey: "k" });
    expect((await GET(req("svc=sonarr&ref=//evil.com/x.jpg"))).status).toBe(400);
  });

  it("returns 400 when the stored base URL is malformed (new URL throws)", async () => {
    mockCreds({ baseUrl: "ht!tp://bad", apiKey: "k" });
    expect((await GET(req("svc=jellyfin&ref=abc"))).status).toBe(400);
  });

  it("proxies a valid jellyfin request, pinned to the service's own origin", async () => {
    mockCreds({ baseUrl: "https://jf.local:8096", apiKey: "k" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: "imgbytes",
      headers: new Headers({ "content-type": "image/png" }),
    });
    globalThis.fetch = fetchMock as never;

    const res = await GET(req("svc=jellyfin&ref=abc123"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    expect(calledUrl.origin).toBe("https://jf.local:8096");
  });

  it("proxies a valid overseerr request to the fixed TMDB CDN origin", async () => {
    mockCreds({ baseUrl: "https://overseerr.local", apiKey: "k" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: "imgbytes",
      headers: new Headers({ "content-type": "image/jpeg" }),
    });
    globalThis.fetch = fetchMock as never;

    const res = await GET(req("svc=overseerr&ref=/poster.jpg"));
    expect(res.status).toBe(200);
    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    expect(calledUrl.origin).toBe("https://image.tmdb.org");
    expect(calledUrl.pathname).toBe("/t/p/w342/poster.jpg");
  });

  it("returns 502 when the upstream responds without a body", async () => {
    mockCreds({ baseUrl: "https://jf.local:8096", apiKey: "k" });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, body: null }) as never;
    expect((await GET(req("svc=jellyfin&ref=abc"))).status).toBe(502);
  });

  it("returns 502 when the upstream fetch throws", async () => {
    mockCreds({ baseUrl: "https://jf.local:8096", apiKey: "k" });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never;
    expect((await GET(req("svc=jellyfin&ref=abc"))).status).toBe(502);
  });
});
