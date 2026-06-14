import { describe, it, expect, vi, beforeEach } from "vitest";

// Same harness as traefik-client.test.ts: stub the HTTP layer + registry so the real Loki
// normalizer runs against controlled payloads, with no DB or network.
vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchJsonRaw: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    constructor(service: string, message: string) { super(`[${service}] ${message}`); this.service = service; }
  },
}));
vi.mock("@/lib/integrations/registry", () => ({ getServiceCredentials: vi.fn(), getDeploymentSetting: vi.fn(), getServiceConfigsByLogo: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:" }, authConfigured: false }));

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials, getServiceConfigsByLogo } from "@/lib/integrations/registry";
import { lokiTail, lokiSelectorFor } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);

// Resolve one active Loki source for the "loki" logo (slug-aware, like the traefik harness).
const wireLoki = (sources: { id: string; name: string; active: boolean }[]) =>
  vi.mocked(getServiceConfigsByLogo).mockImplementation(async (slug: string) =>
    (slug === "loki" ? sources.map((s) => ({ ...s, logoSlug: "loki" })) : []) as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://loki:3100", apiKey: null, insecureTls: false } as never);
  wireLoki([{ id: "loki", name: "Loki", active: true }]);
});

describe("lokiSelectorFor", () => {
  it("returns the explicit lokiQuery when set", () => {
    expect(lokiSelectorFor({ id: "sonarr", lokiQuery: '{app="sonarr"}' })).toBe('{app="sonarr"}');
  });
  it("falls back to the inferred {container=\"<id>\"} default when blank/absent", () => {
    expect(lokiSelectorFor({ id: "radarr" })).toBe('{container="radarr"}');
    expect(lokiSelectorFor({ id: "radarr", lokiQuery: "   " })).toBe('{container="radarr"}');
    expect(lokiSelectorFor({ id: "radarr", lokiQuery: null })).toBe('{container="radarr"}');
  });
});

describe("lokiTail", () => {
  // Two streams; per-stream values are ascending — the client must flatten + sort newest-first.
  const wire = () => {
    mockJson.mockResolvedValue({
      data: {
        result: [
          { stream: { container: "sonarr" }, values: [
            ["1700000000000000000", "starting up"],
            ["1700000002000000000", "WARN disk almost full"],
          ] },
          { stream: { container: "sonarr" }, values: [
            ["1700000001000000000", "ERROR could not connect"],
            ["1700000003000000000", "debug heartbeat ok"],
          ] },
        ],
      },
    } as never);
  };

  it("flattens streams, sorts newest-first, attaches labels and detects level", async () => {
    wire();
    const lines = await lokiTail('{container="sonarr"}');
    expect(lines.map((l) => l.tsNs)).toEqual([
      "1700000003000000000",
      "1700000002000000000",
      "1700000001000000000",
      "1700000000000000000",
    ]);
    expect(lines[0]).toMatchObject({ line: "debug heartbeat ok", level: "debug", labels: { container: "sonarr" } });
    expect(lines[1].level).toBe("warn");
    expect(lines[2].level).toBe("error");
    // ns → ISO conversion (drops the last 6 digits → ms).
    expect(lines[3].ts).toBe(new Date(1700000000000).toISOString());
  });

  it("queries query_range with the selector + backward direction and no auth header by default", async () => {
    wire();
    await lokiTail('{container="sonarr"}', { limit: 50 });
    const [url, opts] = mockJson.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(url).toContain("/loki/api/v1/query_range");
    expect(url).toContain(`query=${encodeURIComponent('{container="sonarr"}')}`);
    expect(url).toContain("direction=backward");
    expect(url).toContain("limit=50");
    expect(opts.headers?.Authorization).toBeUndefined();
  });

  it("sends a Bearer header for a token secret and Basic for a user:password secret", async () => {
    wire();
    vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://loki:3100", apiKey: "abc123", insecureTls: false } as never);
    await lokiTail('{container="x"}');
    expect((mockJson.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer abc123");

    vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://loki:3100", apiKey: "user:pass", insecureTls: false } as never);
    await lokiTail('{container="x"}');
    const auth = (mockJson.mock.calls[1][1] as { headers: Record<string, string> }).headers.Authorization;
    expect(auth).toBe(`Basic ${Buffer.from("user:pass").toString("base64")}`);
  });

  it("throws when no active Loki source is configured", async () => {
    vi.mocked(getServiceConfigsByLogo).mockResolvedValue([] as never);
    await expect(lokiTail('{container="x"}')).rejects.toThrow();
  });
});
