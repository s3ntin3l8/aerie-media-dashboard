import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the HTTP layer + registry so the real serviceClient + forwardAuth logic runs against
// controlled responses (same harness style as forward-auth.test.ts).
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
vi.mock("@/lib/integrations/registry", () => ({ getServiceCredentials: vi.fn(), getServiceSecret: vi.fn() }));

import { fetchJson, fetchRaw, IntegrationError } from "@/lib/integrations/http";
import { getServiceCredentials, getServiceSecret } from "@/lib/integrations/registry";
import { serviceClient } from "@/lib/integrations/serviceClient";
import { clearForwardAuthCache } from "@/lib/integrations/forwardAuth";

const mockJson = vi.mocked(fetchJson);
const mockRaw = vi.mocked(fetchRaw);
const mockCreds = vi.mocked(getServiceCredentials);
const mockSecret = vi.mocked(getServiceSecret);

const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const jwt = (expSec: number) => `h.${b64url({ exp: expSec })}.sig`;

beforeEach(() => {
  vi.clearAllMocks();
  clearForwardAuthCache();
  mockCreds.mockResolvedValue({ baseUrl: "http://svc.test/", apiKey: "k", insecureTls: false } as never);
  mockSecret.mockResolvedValue(null); // no forward-auth by default
});

describe("serviceClient", () => {
  it("strips the trailing slash, joins the path, and auto-applies the service label + insecureTls", async () => {
    mockCreds.mockResolvedValue({ baseUrl: "http://svc.test/", apiKey: "k", insecureTls: true } as never);
    mockJson.mockResolvedValue({ ok: 1 } as never);
    const svc = await serviceClient("sonarr");
    await svc.json("/api/v3/queue", { headers: { "X-Api-Key": svc.apiKey } });
    expect(mockJson).toHaveBeenCalledWith("http://svc.test/api/v3/queue", {
      headers: { "X-Api-Key": "k" },
      service: "sonarr",
      insecureTls: true,
    });
  });

  it("passes an absolute URL through unchanged", async () => {
    mockJson.mockResolvedValue({} as never);
    const svc = await serviceClient("sonarr");
    await svc.json("http://other.test/x");
    expect(mockJson.mock.calls[0][0]).toBe("http://other.test/x");
  });

  it("throws (requireKey default) when no apiKey is stored, but allows it with requireKey:false", async () => {
    mockCreds.mockResolvedValue({ baseUrl: "http://svc.test", apiKey: null, insecureTls: false } as never);
    await expect(serviceClient("sonarr")).rejects.toThrow();
    const svc = await serviceClient("gatus", { requireKey: false });
    expect(svc.apiKey).toBeNull();
  });

  it("throws when the service is not configured at all", async () => {
    mockCreds.mockResolvedValue(null as never);
    await expect(serviceClient("ghost", { requireKey: false })).rejects.toThrow(/not configured/);
  });

  it("merges the forward-auth Authorization, winning over the app's own", async () => {
    mockSecret.mockResolvedValue(JSON.stringify({ method: "basic", username: "svc", password: "pw" }));
    mockJson.mockResolvedValue({} as never);
    const svc = await serviceClient("sonarr");
    await svc.json("/x", { headers: { Authorization: "Basic upstream", "X-Api-Key": "k" } });
    const [, opts] = mockJson.mock.calls[0];
    expect(opts.headers?.Authorization).toBe(`Basic ${Buffer.from("svc:pw").toString("base64")}`);
    expect(opts.headers?.["X-Api-Key"]).toBe("k");
  });

  it("re-mints the bearer token and retries once on a 401", async () => {
    mockSecret.mockResolvedValue(
      JSON.stringify({ method: "bearer", tokenUrl: "https://auth.test/token", clientId: "c", username: "u", password: "p" }),
    );
    mockRaw
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: jwt(Math.floor(Date.now() / 1000) + 3600) }) } as never)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: jwt(Math.floor(Date.now() / 1000) + 7200) }) } as never);
    mockJson
      .mockRejectedValueOnce(new IntegrationError("sonarr", "HTTP 401", 401))
      .mockResolvedValueOnce({ ok: 1 } as never);

    const svc = await serviceClient("sonarr");
    const out = await svc.json<{ ok: number }>("/x");
    expect(out).toEqual({ ok: 1 });
    expect(mockJson).toHaveBeenCalledTimes(2);
    expect(mockRaw).toHaveBeenCalledTimes(2); // initial mint + forced re-mint
  });

  it("raw() joins the path and applies insecureTls without retrying", async () => {
    mockCreds.mockResolvedValue({ baseUrl: "http://svc.test", apiKey: "k", insecureTls: true } as never);
    mockRaw.mockResolvedValue({ ok: true } as never);
    const svc = await serviceClient("qbittorrent");
    await svc.raw("/api/v2/app/version", { headers: { Cookie: "SID=x" } });
    expect(mockRaw).toHaveBeenCalledWith("http://svc.test/api/v2/app/version", {
      headers: { Cookie: "SID=x" },
      service: "qbittorrent",
      insecureTls: true,
    });
  });
});
