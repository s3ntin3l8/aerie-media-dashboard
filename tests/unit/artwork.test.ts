import { describe, it, expect, vi, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// The route resolves credentials from the registry (server-only, DB-backed). Stub it so the
// test exercises only URL construction + the SSRF origin guard, with no DB.
vi.mock("@/lib/integrations/registry", () => ({
  getServiceCredentials: vi.fn(),
}));

import { GET, isPlainPath } from "@/app/api/artwork/route";
import { getServiceCredentials } from "@/lib/integrations/registry";

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

describe("GET /api/artwork", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
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
