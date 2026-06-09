import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    configFile: "/tmp/test-aerie.yaml",
    encryptionKey: "0".repeat(64),
    authSecret: "test",
    authIssuer: "",
    authClientId: "",
    authClientSecret: "",
    oidcProviderId: "oidc",
    oidcProviderName: "SSO",
    oidcProviderIcon: "shield_person",
    oidcScopes: "openid email profile groups",
    oidcGroupsClaim: "groups",
    adminGroup: "admins",
    adminEmails: [],
    databaseUrl: "file::memory:",
    brand: "AERIE",
    portalUrl: "https://test",
  },
  authConfigured: false,
}));

import { existsSync, readFileSync } from "node:fs";
import { loadServiceConfigFile } from "@/lib/config/services";

const mockExists = vi.mocked(existsSync);
const mockRead = vi.mocked(readFileSync);

describe("loadServiceConfigFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MY_KEY;
    delete process.env.SERVICE_HOST;
  });

  it("returns null when file does not exist", () => {
    mockExists.mockReturnValue(false);
    expect(loadServiceConfigFile()).toBeNull();
  });

  it("returns null when file is empty (parse returns null)", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue("");
    expect(loadServiceConfigFile()).toBeNull();
  });

  it("returns null for invalid YAML (parse error)", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue("::: invalid yaml :::");
    expect(loadServiceConfigFile()).toBeNull();
  });

  it("returns null when services have duplicate IDs", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(`
services:
  - id: plex
    name: Plex
    cat: stream
    icon: plex
    host: https://plex.example.com
  - id: plex
    name: Plex Duplicate
    cat: stream
    icon: plex
    host: https://plex2.example.com
`);
    expect(loadServiceConfigFile()).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(`
services:
  - id: plex
    name: Plex
`);
    expect(loadServiceConfigFile()).toBeNull();
  });

  it("loads a valid config with services, groups, and visibility", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(`
services:
  - id: plex
    name: Plex
    cat: stream
    icon: plex
    host: https://plex.example.com
groups:
  - name: admins
    label: Administrators
  - name: friends
visibility:
  - serviceId: plex
    groupName: friends
    visible: true
`);
    const result = loadServiceConfigFile();
    expect(result).not.toBeNull();
    expect(result!.services).toHaveLength(1);
    expect(result!.services[0].id).toBe("plex");
    expect(result!.groups).toHaveLength(2);
    expect(result!.visibility).toHaveLength(1);
    expect(result!.visibility![0].visible).toBe(true);
  });

  it("resolves ${ENV_VAR} references in string fields", () => {
    process.env.MY_KEY = "secret-key-123";
    process.env.SERVICE_HOST = "http://plex:32400";
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(`
services:
  - id: plex
    name: Plex
    cat: stream
    icon: plex
    host: https://plex.example.com
    apiKey: "\${MY_KEY}"
    internalUrl: "\${SERVICE_HOST}"
`);
    const result = loadServiceConfigFile();
    expect(result).not.toBeNull();
    expect(result!.services[0].apiKey).toBe("secret-key-123");
    expect(result!.services[0].internalUrl).toBe("http://plex:32400");
  });

  it("defaults services to empty array when not specified", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(`
groups:
  - name: admins
`);
    const result = loadServiceConfigFile();
    expect(result).not.toBeNull();
    expect(result!.services).toEqual([]);
  });
});