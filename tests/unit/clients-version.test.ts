import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockHttp, mockClientsRegistry, mockEnv } from "./clientsMocks";

vi.mock("@/lib/integrations/http", () => mockHttp());
vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
vi.mock("@/lib/env", () => mockEnv());

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { detectVersion, probeVersion } from "@/lib/integrations/clients";

const mockFetchJson = vi.mocked(fetchJson);
const mockGetCreds = vi.mocked(getServiceCredentials);

describe("serviceKind — via detectVersion and probeVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectVersion — unknown service kind returns null", () => {
    it("returns null for an unrecognized service id", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://svc", apiKey: "key", insecureTls: false });
      const result = await detectVersion("unknown-service");
      expect(result).toBeNull();
    });
  });

  describe("probeVersion — version detection per service kind", () => {
    it("detects Sonarr version via /api/v3/system/status", async () => {
      mockFetchJson.mockResolvedValue({ version: "4.0.11.2680" });
      const result = await probeVersion("http://sonarr:8989", "key", "sonarr");
      expect(result).toBe("4.0.11.2680");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/v3/system/status"),
        expect.objectContaining({ service: "version-detect" }),
      );
    });

    it("detects Radarr version via /api/v3/system/status", async () => {
      mockFetchJson.mockResolvedValue({ version: "5.14.0.9383" });
      const result = await probeVersion("http://radarr:7878", "key", "radarr");
      expect(result).toBe("5.14.0.9383");
    });

    it("detects Prowlarr version via /api/v1/system/status (v1 API)", async () => {
      mockFetchJson.mockResolvedValue({ version: "1.31.2.6552" });
      const result = await probeVersion("http://prowlarr:9696", "key", "prowlarr");
      expect(result).toBe("1.31.2.6552");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/system/status"),
        expect.anything(),
      );
    });

    it("detects Jellyfin version via /System/Info", async () => {
      mockFetchJson.mockResolvedValue({ Version: "10.9.11" });
      const result = await probeVersion("http://jellyfin:8096", "key", "jellyfin");
      expect(result).toBe("10.9.11");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/System/Info"),
        expect.anything(),
      );
    });

    it("detects Overseerr version via /api/v1/status", async () => {
      mockFetchJson.mockResolvedValue({ version: "1.34.0" });
      const result = await probeVersion("http://overseerr:5055", "key", "overseerr");
      expect(result).toBe("1.34.0");
    });

    it("detects Authentik version via /api/v3/admin/version/ with a Bearer token", async () => {
      mockFetchJson.mockResolvedValue({ version_current: "2026.5.2" });
      const result = await probeVersion("https://authentik.test", "tok", "authentik");
      expect(result).toBe("2026.5.2");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/v3/admin/version/"),
        expect.objectContaining({ service: "version-detect", headers: { Authorization: "Bearer tok" } }),
      );
    });

    it("detectVersion('authentik') returns null when the token is rejected (403 throws)", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "https://authentik.test", apiKey: "bad", insecureTls: false });
      mockFetchJson.mockRejectedValue(new Error("[version-detect] HTTP 403"));
      expect(await detectVersion("authentik")).toBeNull();
    });

    it("detects Jellyseerr as overseerr kind", async () => {
      mockFetchJson.mockResolvedValue({ version: "2.0.0" });
      const result = await probeVersion("http://jellyseerr:5055", "key", "jellyseerr");
      expect(result).toBe("2.0.0");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/status"),
        expect.anything(),
      );
    });

    it("detects raw Traefik version via /api/version", async () => {
      mockFetchJson.mockResolvedValue({ Version: "3.7.1" });
      const result = await probeVersion("http://traefik:8080", "", "traefik");
      expect(result).toBe("3.7.1");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/version"),
        expect.objectContaining({ service: "version-detect" }),
      );
    });

    it("traefik aggregator: falls back to /api/snapshot when /api/version is absent → connected, no version", async () => {
      mockFetchJson
        .mockRejectedValueOnce(new Error("[version-detect] HTTP 404"))
        .mockResolvedValueOnce({ httpRouters: [] });
      const result = await probeVersion("http://aggregator:8080", "", "traefik-viewer");
      expect(result).toBe(""); // reachable, no version field
      const urls = mockFetchJson.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes("/api/version"))).toBe(true);
      expect(urls.some((u) => u.includes("/api/snapshot"))).toBe(true);
    });

    it("traefik aggregator: surfaces a top-level `version` from /api/snapshot when present", async () => {
      mockFetchJson
        .mockRejectedValueOnce(new Error("404"))
        .mockResolvedValueOnce({ version: "1.4.0", httpRouters: [] });
      expect(await probeVersion("http://aggregator:8080", "", "traefik-aggregator")).toBe("1.4.0");
    });

    it("traefik: returns null when both probes fail (→ 'could not connect')", async () => {
      mockFetchJson.mockRejectedValue(new Error("unreachable"));
      expect(await probeVersion("http://traefik:8080", "", "traefik-viewer")).toBeNull();
    });

    it("strips leading v from version via normalizeVersion", async () => {
      mockFetchJson.mockResolvedValue({ version: "v1.2.3" });
      const result = await probeVersion("http://svc:8080", "key", "sonarr");
      expect(result).toBe("1.2.3");
    });

    it("strips leading V from version via normalizeVersion", async () => {
      mockFetchJson.mockResolvedValue({ version: "V2.0.0" });
      const result = await probeVersion("http://svc:8080", "key", "radarr");
      expect(result).toBe("2.0.0");
    });

    it("shortens develop-SHA versions via normalizeVersion", async () => {
      mockFetchJson.mockResolvedValue({ version: "develop-abcdef12345678" });
      const result = await probeVersion("http://svc:8080", "key", "sonarr");
      expect(result).toBe("develop-abcdef1");
    });

    it("returns null for null/undefined version", async () => {
      mockFetchJson.mockResolvedValue({ version: undefined });
      const result = await probeVersion("http://svc:8080", "key", "sonarr");
      expect(result).toBeNull();
    });

    it("returns null for unrecognized kind", async () => {
      const result = await probeVersion("http://svc:8080", "key", "random-tool");
      expect(result).toBeNull();
    });

    it("handles Tautulli version detection", async () => {
      mockFetchJson.mockResolvedValue({ response: { data: { tautulli_version: "v2.14.5" } } });
      const result = await probeVersion("http://tautulli:8181", "key", "tautulli");
      expect(result).toBe("2.14.5");
    });

    it("handles Gatus (connectivity check, returns empty string)", async () => {
      mockFetchJson.mockResolvedValue({});
      const result = await probeVersion("http://gatus:8080", "key", "gatus");
      expect(result).toBe("");
    });

    it("returns null on fetch error", async () => {
      mockFetchJson.mockRejectedValue(new Error("connection refused"));
      const result = await probeVersion("http://svc:8080", "key", "sonarr");
      expect(result).toBeNull();
    });
  });
});