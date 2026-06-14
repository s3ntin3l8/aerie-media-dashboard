import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    status?: number;
    constructor(service: string, message: string, status?: number) {
      super(`[${service}] ${message}`);
      this.name = "IntegrationError";
      this.service = service;
      this.status = status;
    }
  },
}));

vi.mock("@/lib/integrations/registry", () => ({
  getServiceSecret: vi.fn(), getServiceCredentials: vi.fn(),
  getDeploymentSetting: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    encryptionKey: "0".repeat(64),
    authSecret: "test",
    prometheusInstance: undefined,
    configFile: "/dev/null",
    brand: "AERIE",
    portalUrl: "https://test",
    adminGroup: "admins",
    adminEmails: [],
    authIssuer: "",
    authClientId: "",
    authClientSecret: "",
    oidcProviderId: "oidc",
    oidcProviderName: "SSO",
    oidcProviderIcon: "shield_person",
    oidcScopes: "openid email profile groups",
    oidcGroupsClaim: "groups",
    databaseUrl: "file::memory:",
  },
  authConfigured: false,
}));

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import {
  lazylibrarianLibraryStats,
  listenarrLibraryStats,
  overseerrUserQuota,
  type LazyLibrarianStats,
  type ListenarrStats,
} from "@/lib/integrations/clients";

const mockFetchJson = vi.mocked(fetchJson);
const mockGetCreds = vi.mocked(getServiceCredentials);

describe("lazylibrarianLibraryStats", () => {
  it("returns both audiobooks and ebooks when both are > 0", () => {
    const stats: LazyLibrarianStats = {
      totalBooks: 100,
      authors: 50,
      ebooks: 80,
      audiobooks: 30,
      wanted: 5,
      snatched: 2,
    };
    const result = lazylibrarianLibraryStats(stats);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("ll-audiobooks");
    expect(result[0].label).toBe("Audiobooks");
    expect(result[0].icon).toBe("headphones");
    expect(result[0].delta).toBe("on disk");
    expect(result[1].id).toBe("ll-ebooks");
    expect(result[1].label).toBe("eBooks");
    expect(result[1].icon).toBe("book_2");
  });

  it("returns only ebooks when audiobooks is 0", () => {
    const stats: LazyLibrarianStats = {
      totalBooks: 50,
      authors: 25,
      ebooks: 40,
      audiobooks: 0,
      wanted: 3,
      snatched: 1,
    };
    const result = lazylibrarianLibraryStats(stats);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ll-ebooks");
  });

  it("returns only audiobooks when ebooks is 0", () => {
    const stats: LazyLibrarianStats = {
      totalBooks: 20,
      authors: 10,
      ebooks: 0,
      audiobooks: 15,
      wanted: 2,
      snatched: 0,
    };
    const result = lazylibrarianLibraryStats(stats);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ll-audiobooks");
  });

  it("returns empty array when both are 0", () => {
    const stats: LazyLibrarianStats = {
      totalBooks: 0,
      authors: 0,
      ebooks: 0,
      audiobooks: 0,
      wanted: 0,
      snatched: 0,
    };
    const result = lazylibrarianLibraryStats(stats);
    expect(result).toHaveLength(0);
  });
});

describe("listenarrLibraryStats", () => {
  it("returns audiobooks stat when audiobooks > 0", () => {
    const stats: ListenarrStats = {
      audiobooks: 42,
      authors: 10,
      monitored: 30,
      wanted: 5,
    };
    const result = listenarrLibraryStats(stats);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("listenarr-audiobooks");
    expect(result[0].label).toBe("Audiobooks");
    expect(result[0].icon).toBe("headphones");
    expect(result[0].delta).toBe("in Listenarr");
  });

  it("returns empty array when audiobooks is 0", () => {
    const stats: ListenarrStats = {
      audiobooks: 0,
      authors: 0,
      monitored: 0,
      wanted: 0,
    };
    const result = listenarrLibraryStats(stats);
    expect(result).toHaveLength(0);
  });
});

describe("mapQuota via overseerrUserQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps limit=0 to null and passes through every other field", async () => {
    mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
    mockFetchJson.mockResolvedValue({
      movie: { limit: 0, days: 7, used: 0, remaining: 0, restricted: false },
      tv: { limit: 5, days: 14, used: 2, remaining: 3, restricted: true },
    });

    const result = await overseerrUserQuota(1);

    // movie: limit=0 → null; other fields pass through
    expect(result.movie).toEqual({
      limit: null,
      days: 7,
      used: 0,
      remaining: 0,
      restricted: false,
    });

    // tv: limit=5 stays 5; all other fields pass through
    expect(result.tv).toEqual({
      limit: 5,
      days: 14,
      used: 2,
      remaining: 3,
      restricted: true,
    });
  });
});