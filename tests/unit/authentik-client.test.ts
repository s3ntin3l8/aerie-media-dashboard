import { describe, it, expect, vi, beforeEach } from "vitest";

// Same harness as traefik-client.test.ts: stub the HTTP layer + registry creds so the real
// authentik normalizer runs against controlled payloads, with no DB or network.
vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchJsonRaw: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    constructor(service: string, message: string) { super(`[${service}] ${message}`); this.service = service; }
  },
}));
vi.mock("@/lib/integrations/registry", () => ({ getServiceSecret: vi.fn(), getServiceCredentials: vi.fn(), getDeploymentSetting: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:" }, authConfigured: false }));

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { clearCache, authentikApps, appHost, resolveAccess } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "https://authentik.lan", apiKey: "tok", insecureTls: false } as never);
});

describe("appHost", () => {
  it("prefers meta_launch_url, returns the hostname (lowercased, port stripped)", () => {
    expect(appHost({ meta_launch_url: "https://Sonarr.LAN:8443/x", launch_url: "https://other.lan" })).toBe("sonarr.lan");
    expect(appHost({ launch_url: "https://radarr.lan" })).toBe("radarr.lan");
  });
  it("returns null for relative/empty launch URLs", () => {
    expect(appHost({ launch_url: "/relative" })).toBeNull();
    expect(appHost({})).toBeNull();
  });
});

describe("resolveAccess", () => {
  it("treats no enabled access bindings as everyone", () => {
    expect(resolveAccess([])).toEqual({ everyone: true, groups: [], users: 0, policyGated: false });
  });
  it("collects groups, counts users, flags policy-gated; excludes disabled/negated", () => {
    const r = resolveAccess([
      { target: "a", group: "g1", group_obj: { name: "media" }, enabled: true },
      { target: "a", group: "g2", group_obj: { name: "admins" }, enabled: true },
      { target: "a", user: 5, enabled: true },
      { target: "a", policy: "p1", enabled: true },
      { target: "a", group: "g3", group_obj: { name: "nope" }, enabled: false },
      { target: "a", group: "g4", group_obj: { name: "neg" }, negate: true },
    ] as never);
    expect(r).toEqual({ everyone: false, groups: ["media", "admins"], users: 1, policyGated: true });
  });
});

describe("authentikApps", () => {
  const wire = () => {
    mockJson.mockImplementation(async (url: string) => {
      if (url.includes("/core/applications/")) {
        return { results: [
          { pk: "app1", name: "Sonarr", slug: "sonarr", meta_launch_url: "https://sonarr.lan/", provider_obj: { name: "sonarr-proxy", verbose_name: "Proxy Provider", component: "ak-provider-proxy" } },
          { pk: "app2", name: "Radarr", slug: "radarr", launch_url: "https://radarr.lan", provider_obj: { name: "radarr-oauth", verbose_name: "OAuth2/OpenID Provider" } },
          { pk: "app3", name: "Internal", slug: "internal", launch_url: "/relative" }, // no host → dropped
        ] } as never;
      }
      if (url.includes("/policies/bindings/")) {
        return { results: [
          { target: "app1", group: "g1", group_obj: { name: "media" }, enabled: true },
          { target: "app1", policy: "p1", enabled: true },
          { target: "someflow", group: "g9", group_obj: { name: "ignored" }, enabled: true }, // non-app target
        ] } as never;
      }
      return { results: [] } as never;
    });
  };

  it("correlates apps, resolves access from bindings, drops host-less apps", async () => {
    wire();
    const apps = await authentikApps();
    expect(apps.map((a) => a.appSlug).sort()).toEqual(["radarr", "sonarr"]); // internal dropped (no host)
    const sonarr = apps.find((a) => a.appSlug === "sonarr")!;
    expect(sonarr).toMatchObject({ host: "sonarr.lan", everyone: false, groups: ["media"], policyGated: true, providerType: "Proxy Provider", providerName: "sonarr-proxy", serviceId: "" });
    // radarr has no bindings → everyone
    expect(apps.find((a) => a.appSlug === "radarr")).toMatchObject({ everyone: true, groups: [], providerType: "OAuth2/OpenID Provider" });
  });

  it("throws when not configured and when a call fails", async () => {
    vi.mocked(getServiceCredentials).mockResolvedValueOnce(null as never);
    await expect(authentikApps()).rejects.toThrow();

    mockJson.mockRejectedValue(new Error("HTTP 403"));
    await expect(authentikApps()).rejects.toThrow();
  });
});
