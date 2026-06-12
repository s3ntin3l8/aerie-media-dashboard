import { describe, it, expect } from "vitest";
import {
  getServiceConfigs, getServiceSecret, getServiceCredentials, isConfigured,
  getFavorites, setFavorites, getDashboards, setDashboards,
  getDeploymentSetting, setDeploymentSetting,
  getGroups, getVisibility, getMembers,
  mirrorUser, getUserByEmail, localAdminExists, createLocalAdmin,
} from "@/lib/integrations/registry";
import { verifyPassword } from "@/lib/auth/password";
import { updateServiceVersion } from "@/lib/integrations/registry";
import { db, schema } from "@/lib/db/client";
import { encrypt } from "@/lib/crypto";

// Exercises the real registry against the in-memory libSQL DB (DATABASE_URL=file::memory:
// from server.env.ts). The first call triggers ensureDb() → migrate + seed. Cases run in
// order and share the one in-process DB.

describe("registry — seeded reads", () => {
  it("seeds the default groups", async () => {
    const groups = await getGroups();
    expect(groups.map((g) => g.name).sort()).toEqual(["admins", "friends", "guests"]);
  });

  it("returns arrays for services and visibility", async () => {
    expect(Array.isArray(await getServiceConfigs())).toBe(true);
    expect(Array.isArray(await getVisibility())).toBe(true);
  });

  it("reports unconfigured services as such", async () => {
    expect(await getServiceSecret("nope")).toBeNull();
    expect(await isConfigured("nope")).toBe(false);
    expect(await getServiceCredentials("nope")).toBeNull();
  });
});

describe("registry — deployment settings", () => {
  it("returns null for an unknown key", async () => {
    expect(await getDeploymentSetting("missing")).toBeNull();
  });

  it("round-trips and upserts a value", async () => {
    await setDeploymentSetting("metricsSource", "beszel");
    expect(await getDeploymentSetting("metricsSource")).toBe("beszel");
    await setDeploymentSetting("metricsSource", "prometheus");
    expect(await getDeploymentSetting("metricsSource")).toBe("prometheus");
  });
});

describe("registry — users & preferences", () => {
  it("mirrors an OIDC user and reads it back (case-insensitive email)", async () => {
    await mirrorUser({ id: "u1", name: "Ada", email: "Ada@Example.com", role: "user" });
    const members = await getMembers();
    expect(members.find((m) => m.id === "u1")?.name).toBe("Ada");
    const byEmail = await getUserByEmail("  ADA@example.com ");
    expect(byEmail?.id).toBe("u1");
    expect(byEmail?.passwordHash).toBeNull();
  });

  it("round-trips favorites and dashboards for a user", async () => {
    await setFavorites("u1", ["radarr", "sonarr"]);
    expect(await getFavorites("u1")).toEqual(["radarr", "sonarr"]);
    expect(await getFavorites("ghost")).toEqual([]);

    await setDashboards("u1", { admin: [{ uid: "a", type: "status", x: 0, y: 0, w: 4, h: 4 }] });
    expect((await getDashboards("u1"))?.admin?.[0].type).toBe("status");
    expect(await getDashboards("ghost")).toBeNull();
  });

  it("creates a local admin with a verifiable password hash", async () => {
    expect(await localAdminExists()).toBe(false);
    await createLocalAdmin({ name: "Root", email: "Root@Local", password: "s3cret-pw" });
    expect(await localAdminExists()).toBe(true);
    const admin = await getUserByEmail("root@local");
    expect(admin?.role).toBe("admin");
    expect(admin?.passwordHash).toBeTruthy();
    expect(verifyPassword("s3cret-pw", admin!.passwordHash!)).toBe(true);
  });
});

describe("registry — services & secrets", () => {
  it("decrypts a stored secret and resolves credentials, and updates the version", async () => {
    await db.insert(schema.services).values({ id: "radarr", name: "Radarr", cat: "automation", icon: "movie", host: "radarr.test", baseUrl: "https://radarr.test", insecureTls: true });
    const enc = encrypt("super-secret-key");
    await db.insert(schema.serviceSecrets).values({ serviceId: "radarr", kind: "apiKey", iv: enc.iv, authTag: enc.authTag, ciphertext: enc.ciphertext, updatedAt: new Date() });

    expect(await getServiceSecret("radarr")).toBe("super-secret-key");
    expect(await isConfigured("radarr")).toBe(true);
    const creds = await getServiceCredentials("radarr");
    expect(creds).toMatchObject({ baseUrl: "https://radarr.test", apiKey: "super-secret-key", insecureTls: true });

    await updateServiceVersion("radarr", "5.1.0");
    const cfg = (await getServiceConfigs()).find((c) => c.id === "radarr");
    expect(cfg?.version).toBe("5.1.0");
  });
});
