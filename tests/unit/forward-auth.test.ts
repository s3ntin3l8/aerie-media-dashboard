import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the HTTP layer + registry so the real forward-auth logic runs against controlled
// responses, with no DB or network (same harness style as traefik-aggregator.test.ts).
vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    status?: number;
    constructor(service: string, message: string, status?: number) {
      super(`[${service}] ${message}`);
      this.service = service;
      this.status = status;
    }
  },
}));
vi.mock("@/lib/integrations/registry", () => ({ getServiceSecret: vi.fn() }));

import { fetchJson, fetchRaw, IntegrationError } from "@/lib/integrations/http";
import { getServiceSecret } from "@/lib/integrations/registry";
import {
  parseForwardAuthConfig,
  forwardAuthHeaders,
  authedFetchJson,
  authedFetchRaw,
  jwtExpMs,
  clearForwardAuthCache,
} from "@/lib/integrations/forwardAuth";

const mockJson = vi.mocked(fetchJson);
const mockRaw = vi.mocked(fetchRaw);
const mockSecret = vi.mocked(getServiceSecret);

const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
/** A JWT-shaped string whose payload carries the given exp (epoch seconds). */
const jwt = (expSec: number) => `h.${b64url({ exp: expSec })}.sig`;
const tokenRes = (token: string) => ({ ok: true, json: async () => ({ access_token: token }) }) as unknown as Response;

const BEARER = JSON.stringify({
  method: "bearer",
  tokenUrl: "https://auth.test/application/o/token/",
  clientId: "cid",
  username: "svc",
  password: "pw",
  scope: "openid",
});
const BASIC = JSON.stringify({ method: "basic", username: "svc", password: "pw" });

beforeEach(() => {
  vi.clearAllMocks();
  clearForwardAuthCache();
});

describe("parseForwardAuthConfig", () => {
  it("accepts valid basic + bearer configs", () => {
    expect(parseForwardAuthConfig(BASIC)).toMatchObject({ method: "basic", username: "svc" });
    expect(parseForwardAuthConfig(BEARER)).toMatchObject({ method: "bearer", clientId: "cid" });
  });
  it("returns null for null, malformed JSON, and incomplete configs", () => {
    expect(parseForwardAuthConfig(null)).toBeNull();
    expect(parseForwardAuthConfig("not json")).toBeNull();
    expect(parseForwardAuthConfig(JSON.stringify({ method: "bearer", username: "x" }))).toBeNull(); // missing tokenUrl/clientId
    expect(parseForwardAuthConfig(JSON.stringify({ method: "saml" }))).toBeNull(); // unknown method
  });
});

describe("forwardAuthHeaders", () => {
  it("encodes Basic from user:password", async () => {
    const cfg = parseForwardAuthConfig(BASIC)!;
    const headers = await forwardAuthHeaders("svc1", cfg);
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("svc:pw").toString("base64")}`);
    expect(mockRaw).not.toHaveBeenCalled();
  });

  it("mints a Bearer JWT from the token endpoint and caches it", async () => {
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    mockRaw.mockResolvedValue(tokenRes(token));
    const cfg = parseForwardAuthConfig(BEARER)!;

    const h1 = await forwardAuthHeaders("svc1", cfg);
    expect(h1.Authorization).toBe(`Bearer ${token}`);
    // Token endpoint hit once, form-encoded, with the client-credentials grant.
    expect(mockRaw).toHaveBeenCalledTimes(1);
    const [url, opts] = mockRaw.mock.calls[0];
    expect(url).toBe("https://auth.test/application/o/token/");
    expect(opts.method).toBe("POST");
    expect(opts.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(String(opts.body)).toContain("grant_type=client_credentials");
    expect(String(opts.body)).toContain("client_id=cid");

    // Second call reuses the cached token (no second mint).
    const h2 = await forwardAuthHeaders("svc1", cfg);
    expect(h2.Authorization).toBe(`Bearer ${token}`);
    expect(mockRaw).toHaveBeenCalledTimes(1);
  });

  it("force=true re-mints even when cached", async () => {
    mockRaw.mockResolvedValueOnce(tokenRes(jwt(Math.floor(Date.now() / 1000) + 3600)));
    const cfg = parseForwardAuthConfig(BEARER)!;
    await forwardAuthHeaders("svc1", cfg);
    mockRaw.mockResolvedValueOnce(tokenRes(jwt(Math.floor(Date.now() / 1000) + 7200)));
    await forwardAuthHeaders("svc1", cfg, true);
    expect(mockRaw).toHaveBeenCalledTimes(2);
  });
});

describe("authedFetchJson / authedFetchRaw", () => {
  it("passes through untouched when no forward-auth config is stored", async () => {
    mockSecret.mockResolvedValue(null);
    mockJson.mockResolvedValue({ ok: 1 } as never);
    const opts = { service: "x", headers: { "X-Api-Key": "k" } };
    await authedFetchJson("svc1", "https://up.test/api", opts);
    expect(mockJson).toHaveBeenCalledWith("https://up.test/api", opts);
  });

  it("merges the forward-auth Authorization (and it wins over an upstream Basic)", async () => {
    mockSecret.mockResolvedValue(BASIC);
    mockJson.mockResolvedValue({} as never);
    await authedFetchJson("svc1", "https://up.test/api", {
      service: "x",
      headers: { Authorization: "Basic upstream", "X-Api-Key": "k" },
    });
    const [, opts] = mockJson.mock.calls[0];
    expect(opts.headers?.Authorization).toBe(`Basic ${Buffer.from("svc:pw").toString("base64")}`);
    expect(opts.headers?.["X-Api-Key"]).toBe("k");
  });

  it("re-mints and retries once on a 401 for a bearer flow", async () => {
    mockSecret.mockResolvedValue(BEARER);
    mockRaw
      .mockResolvedValueOnce(tokenRes(jwt(Math.floor(Date.now() / 1000) + 3600)))
      .mockResolvedValueOnce(tokenRes(jwt(Math.floor(Date.now() / 1000) + 7200)));
    mockJson
      .mockRejectedValueOnce(new IntegrationError("x", "HTTP 401", 401))
      .mockResolvedValueOnce({ ok: 1 } as never);

    const out = await authedFetchJson<{ ok: number }>("svc1", "https://up.test/api", { service: "x" });
    expect(out).toEqual({ ok: 1 });
    expect(mockJson).toHaveBeenCalledTimes(2);
    expect(mockRaw).toHaveBeenCalledTimes(2); // initial mint + forced re-mint
  });

  it("does not retry a non-401 error", async () => {
    mockSecret.mockResolvedValue(BEARER);
    mockRaw.mockResolvedValue(tokenRes(jwt(Math.floor(Date.now() / 1000) + 3600)));
    mockJson.mockRejectedValue(new IntegrationError("x", "HTTP 500", 500));
    await expect(authedFetchJson("svc1", "https://up.test/api", { service: "x" })).rejects.toThrow();
    expect(mockJson).toHaveBeenCalledTimes(1);
  });

  it("authedFetchRaw passes through when unconfigured", async () => {
    mockSecret.mockResolvedValue(null);
    mockRaw.mockResolvedValue({ ok: true } as Response);
    await authedFetchRaw("svc1", "https://up.test/metrics", { service: "x" });
    expect(mockRaw).toHaveBeenCalledWith("https://up.test/metrics", { service: "x" });
  });
});

describe("jwtExpMs", () => {
  it("decodes the exp claim", () => {
    expect(jwtExpMs(jwt(2_000_000_000))).toBe(2_000_000_000 * 1000);
  });
  it("falls back when unparseable", () => {
    const before = Date.now();
    const got = jwtExpMs("not-a-jwt", 1000);
    expect(got).toBeGreaterThanOrEqual(before + 1000);
  });
});
