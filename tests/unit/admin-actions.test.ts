import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

// requireAdmin() reads the session; next/cache + the heavy clients module aren't needed here.
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/integrations/clients", () => ({
  prometheusInstances: vi.fn(),
  beszelSystems: vi.fn(),
  detectVersion: vi.fn(),
  probeVersion: vi.fn(),
  overseerrUsers: vi.fn(),
  overseerrUpdateUserQuota: vi.fn(),
  matchOverseerrUserId: vi.fn(),
  portainerEndpoints: vi.fn(),
  portainerContainers: vi.fn(),
  portainerRestartContainer: vi.fn(),
}));

import { db, schema } from "@/lib/db/client";
import { ensureDb } from "@/lib/db/bootstrap";
import { getDeploymentSetting } from "@/lib/integrations/registry";
import { getSessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import * as C from "@/lib/integrations/clients";
import {
  upsertService, setServiceKeepAlive, setVisibility, setServiceSecret, setServiceForwardAuth, mergeServiceForwardAuth, clearServiceForwardAuth, setServiceActive,
  serviceExists, deleteService, detectServiceVersion, setMetricsSource, setQueueSource,
  setBeszelSystem, setPrometheusInstance, setUserOverseerrQuota,
  dismissTraefikHost, restoreTraefikHost, restartServiceContainer,
} from "@/app/(portal)/admin/actions";

const asAdmin = () => vi.mocked(getSessionUser).mockResolvedValue({ role: "admin" } as never);
const asUser = () => vi.mocked(getSessionUser).mockResolvedValue({ role: "user" } as never);

beforeAll(async () => {
  // Runs migrations (incl. 0010 keep_alive) against the in-memory DB from server.env.ts.
  await ensureDb();
});

beforeEach(() => vi.clearAllMocks());

describe("setServiceKeepAlive", () => {
  it("persists the keep-alive flag and revalidates the admin path (admin)", async () => {
    asAdmin();
    await upsertService({
      id: "sonarr",
      name: "Sonarr",
      cat: "automation",
      icon: "dns",
      host: "sonarr.test",
      embeddable: true,
      keepAlive: false,
    });

    await setServiceKeepAlive("sonarr", true);

    const [row] = await db
      .select()
      .from(schema.services)
      .where(eq(schema.services.id, "sonarr"));
    expect(row.keepAlive).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("rejects a non-admin caller", async () => {
    asUser();
    await expect(setServiceKeepAlive("sonarr", true)).rejects.toThrow("forbidden");
  });
});

describe("service CRUD + secrets", () => {
  beforeEach(async () => { asAdmin(); await upsertService({ id: "radarr", name: "Radarr", cat: "automation", icon: "dns", host: "radarr.test", embeddable: false, keepAlive: false }); });

  it("serviceExists reflects presence", async () => {
    expect(await serviceExists("radarr")).toBe(true);
    expect(await serviceExists("ghost")).toBe(false);
  });

  it("serviceExists rejects a non-admin caller", async () => {
    asUser();
    await expect(serviceExists("radarr")).rejects.toThrow("forbidden");
  });

  it("setServiceActive flips the active flag", async () => {
    await setServiceActive("radarr", false);
    const [row] = await db.select().from(schema.services).where(eq(schema.services.id, "radarr"));
    expect(row.active).toBe(false);
  });

  it("setServiceSecret stores then clears the encrypted key", async () => {
    await setServiceSecret("radarr", "my-key");
    let rows = await db.select().from(schema.serviceSecrets).where(eq(schema.serviceSecrets.serviceId, "radarr"));
    expect(rows).toHaveLength(1);
    expect(rows[0].ciphertext).not.toBe("my-key"); // encrypted at rest
    await setServiceSecret("radarr", "");
    rows = await db.select().from(schema.serviceSecrets).where(eq(schema.serviceSecrets.serviceId, "radarr"));
    expect(rows).toHaveLength(0);
  });

  const faRows = (id: string) =>
    db.select().from(schema.serviceSecrets).where(and(eq(schema.serviceSecrets.serviceId, id), eq(schema.serviceSecrets.kind, "forwardAuth")));

  it("setServiceForwardAuth stores an encrypted forwardAuth secret then clears it", async () => {
    const cfg = { method: "bearer" as const, tokenUrl: "https://auth.test/application/o/token/", clientId: "cid", username: "svc", password: "pw", scope: "openid" };
    await setServiceForwardAuth("radarr", cfg);
    let rows = await faRows("radarr");
    expect(rows).toHaveLength(1);
    expect(rows[0].ciphertext).not.toBe(JSON.stringify(cfg)); // encrypted at rest, not plaintext
    expect(JSON.parse(decrypt({ iv: rows[0].iv, authTag: rows[0].authTag, ciphertext: rows[0].ciphertext }))).toMatchObject(cfg);

    await clearServiceForwardAuth("radarr");
    rows = await faRows("radarr");
    expect(rows).toHaveLength(0);
  });

  it("forwardAuth coexists with the apiKey, and clearing the apiKey leaves it intact", async () => {
    await setServiceSecret("radarr", "my-key");
    await setServiceForwardAuth("radarr", { method: "basic", username: "svc", password: "pw" });
    expect(await db.select().from(schema.serviceSecrets).where(eq(schema.serviceSecrets.serviceId, "radarr"))).toHaveLength(2);
    // Clearing the apiKey must only drop the apiKey row, not the forwardAuth one.
    await setServiceSecret("radarr", "");
    expect(await faRows("radarr")).toHaveLength(1);
  });

  it("setServiceForwardAuth rejects an invalid config", async () => {
    await expect(setServiceForwardAuth("radarr", { method: "bearer", username: "x" } as never)).rejects.toThrow(/Invalid/);
  });

  it("mergeServiceForwardAuth keeps the stored password when the password field is blank", async () => {
    await setServiceForwardAuth("radarr", { method: "basic", username: "old", password: "secret-pw" });
    // Edit a non-secret field (username) without re-entering the password.
    await mergeServiceForwardAuth("radarr", { method: "basic", username: "new", password: "" });
    const [row] = await faRows("radarr");
    expect(JSON.parse(decrypt({ iv: row.iv, authTag: row.authTag, ciphertext: row.ciphertext }))).toMatchObject({
      method: "basic", username: "new", password: "secret-pw",
    });
  });

  it("mergeServiceForwardAuth uses the entered password when provided", async () => {
    await setServiceForwardAuth("radarr", { method: "basic", username: "u", password: "old-pw" });
    await mergeServiceForwardAuth("radarr", { method: "basic", username: "u", password: "new-pw" });
    const [row] = await faRows("radarr");
    expect(JSON.parse(decrypt({ iv: row.iv, authTag: row.authTag, ciphertext: row.ciphertext })).password).toBe("new-pw");
  });

  it("mergeServiceForwardAuth throws when password is blank and nothing is stored", async () => {
    await clearServiceForwardAuth("radarr");
    await expect(mergeServiceForwardAuth("radarr", { method: "basic", username: "u", password: "" })).rejects.toThrow(/required/);
  });

  it("setVisibility upserts a row for a seeded group", async () => {
    await setVisibility("radarr", "friends", false);
    const [row] = await db.select().from(schema.serviceVisibility).where(eq(schema.serviceVisibility.serviceId, "radarr"));
    expect(row.visible).toBe(false);
  });

  it("deleteService removes the row", async () => {
    await deleteService("radarr");
    expect(await serviceExists("radarr")).toBe(false);
  });

  it("detectServiceVersion writes the detected version", async () => {
    vi.mocked(C.detectVersion).mockResolvedValue("4.1.0");
    expect(await detectServiceVersion("radarr")).toBe("4.1.0");
    const [row] = await db.select().from(schema.services).where(eq(schema.services.id, "radarr"));
    expect(row.version).toBe("4.1.0");
  });

  it("detectServiceVersion returns null and writes nothing when undetected", async () => {
    vi.mocked(C.detectVersion).mockResolvedValue(null);
    expect(await detectServiceVersion("radarr")).toBeNull();
  });
});

describe("deployment-setting actions", () => {
  beforeEach(() => asAdmin());

  it("setMetricsSource persists a valid source and rejects an invalid one", async () => {
    await setMetricsSource("beszel");
    expect(await getDeploymentSetting("metricsSource")).toBe("beszel");
    await expect(setMetricsSource("nonsense" as never)).rejects.toThrow(/Unknown metrics source/);
  });

  it("setQueueSource validates the source", async () => {
    await setQueueSource("nzbget");
    expect(await getDeploymentSetting("queueSource")).toBe("nzbget");
    await expect(setQueueSource("bad" as never)).rejects.toThrow(/Unknown queue source/);
  });

  it("setBeszelSystem rejects an unknown system id", async () => {
    vi.mocked(C.beszelSystems).mockResolvedValue([{ id: "s1", name: "n", status: "up" }]);
    await expect(setBeszelSystem("nope")).rejects.toThrow(/Unknown Beszel system/);
    await setBeszelSystem("s1");
    expect(await getDeploymentSetting("beszelSystem")).toBe("s1");
  });

  it("setPrometheusInstance rejects an unknown instance", async () => {
    vi.mocked(C.prometheusInstances).mockResolvedValue(["node-a"]);
    await expect(setPrometheusInstance("node-z")).rejects.toThrow(/Unknown Prometheus instance/);
    await setPrometheusInstance("node-a");
    expect(await getDeploymentSetting("prometheusInstance")).toBe("node-a");
  });

  it("rejects non-admin callers", async () => {
    asUser();
    await expect(setMetricsSource("beszel")).rejects.toThrow("forbidden");
  });
});

describe("Traefik discovered-host dismiss/restore", () => {
  beforeEach(() => asAdmin());

  it("dismiss persists a lowercased host (idempotent) and restore removes it", async () => {
    await dismissTraefikHost("Books.Unraid.lan");
    let stored = JSON.parse((await getDeploymentSetting("traefikDismissed")) ?? "[]");
    expect(stored).toContain("books.unraid.lan");
    // idempotent — no duplicate
    await dismissTraefikHost("books.unraid.lan");
    stored = JSON.parse((await getDeploymentSetting("traefikDismissed")) ?? "[]");
    expect(stored.filter((h: string) => h === "books.unraid.lan")).toHaveLength(1);

    await restoreTraefikHost("books.unraid.lan");
    stored = JSON.parse((await getDeploymentSetting("traefikDismissed")) ?? "[]");
    expect(stored).not.toContain("books.unraid.lan");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("rejects a non-admin caller", async () => {
    asUser();
    await expect(dismissTraefikHost("x.lan")).rejects.toThrow("forbidden");
    await expect(restoreTraefikHost("x.lan")).rejects.toThrow("forbidden");
  });
});

describe("setUserOverseerrQuota", () => {
  beforeEach(() => asAdmin());

  it("maps the portal user to Overseerr and writes the quota", async () => {
    await db.insert(schema.users).values({ id: "qu", name: "Q", email: "q@x", role: "user", createdAt: new Date() }).onConflictDoNothing();
    vi.mocked(C.overseerrUsers).mockResolvedValue([] as never);
    vi.mocked(C.matchOverseerrUserId).mockReturnValue(11);
    vi.mocked(C.overseerrUpdateUserQuota).mockResolvedValue(undefined as never);
    await setUserOverseerrQuota("qu", { movieQuotaLimit: 5 } as never);
    expect(C.overseerrUpdateUserQuota).toHaveBeenCalledWith(11, { movieQuotaLimit: 5 });
  });

  it("throws when the portal user is unknown", async () => {
    await expect(setUserOverseerrQuota("missing", {} as never)).rejects.toThrow(/User not found/);
  });
});

describe("restartServiceContainer", () => {
  // Stand up a Portainer instance (logo + stored token) and a target service in the in-memory DB.
  const seed = async (target: { containerName?: string | null; portainerEndpointId?: string | null }) => {
    await upsertService({ id: "portainer", name: "Portainer", cat: "infra", icon: "dns", logoSlug: "portainer", host: "ptr.test" });
    await setServiceSecret("portainer", "ptr_tok");
    await upsertService({
      id: "jellyfin", name: "Jellyfin", cat: "stream", icon: "dns", logoSlug: "jellyfin", host: "jf.test",
      containerName: target.containerName ?? null, portainerEndpointId: target.portainerEndpointId ?? null,
    });
  };

  it("rejects a non-admin (defence in depth)", async () => {
    asUser();
    await expect(restartServiceContainer("jellyfin")).rejects.toThrow("forbidden");
  });

  it("takes the direct fast path when both an explicit name and the endpoint are pinned", async () => {
    asAdmin();
    await seed({ containerName: "jellyfin", portainerEndpointId: "3" });
    vi.mocked(C.portainerRestartContainer).mockResolvedValue(undefined as never);

    await restartServiceContainer("jellyfin");

    expect(C.portainerRestartContainer).toHaveBeenCalledWith("portainer", "3", "jellyfin");
    expect(C.portainerEndpoints).not.toHaveBeenCalled(); // no resolution needed when both are pinned
    expect(C.portainerContainers).not.toHaveBeenCalled();
  });

  it("searches the pinned endpoint by name when the container name is not explicit", async () => {
    asAdmin();
    await seed({ containerName: null, portainerEndpointId: "6" });
    vi.mocked(C.portainerContainers).mockResolvedValue([{ Id: "x", Names: ["/jellyfin"], State: "running" }] as never);
    vi.mocked(C.portainerRestartContainer).mockResolvedValue(undefined as never);

    await restartServiceContainer("jellyfin");

    expect(C.portainerContainers).toHaveBeenCalledWith("portainer", "6");
    expect(C.portainerEndpoints).not.toHaveBeenCalled(); // pinned → only that endpoint is searched
    expect(C.portainerRestartContainer).toHaveBeenCalledWith("portainer", "6", "jellyfin");
  });

  it("defaults the container name to the service id and finds it across endpoints", async () => {
    asAdmin();
    await seed({ containerName: null, portainerEndpointId: null });
    vi.mocked(C.portainerEndpoints).mockResolvedValue([{ Id: 5, Name: "dev" }, { Id: 6, Name: "nas" }] as never);
    vi.mocked(C.portainerContainers).mockImplementation(async (_s: string, ep: string) =>
      (ep === "6" ? [{ Id: "x", Names: ["/jellyfin"], State: "running" }] : []) as never);
    vi.mocked(C.portainerRestartContainer).mockResolvedValue(undefined as never);

    await restartServiceContainer("jellyfin");

    expect(C.portainerRestartContainer).toHaveBeenCalledWith("portainer", "6", "jellyfin");
  });

  it("matches case-insensitively and restarts by the container's exact name", async () => {
    asAdmin();
    await seed({ containerName: null, portainerEndpointId: null });
    vi.mocked(C.portainerEndpoints).mockResolvedValue([{ Id: 6, Name: "nas" }] as never);
    vi.mocked(C.portainerContainers).mockResolvedValue([{ Id: "x", Names: ["/Jellyfin"], State: "running" }] as never);
    vi.mocked(C.portainerRestartContainer).mockResolvedValue(undefined as never);

    await restartServiceContainer("jellyfin");

    expect(C.portainerRestartContainer).toHaveBeenCalledWith("portainer", "6", "Jellyfin");
  });

  it("honours an explicit container name that differs from the id when searching", async () => {
    asAdmin();
    await seed({ containerName: "seerr", portainerEndpointId: null });
    vi.mocked(C.portainerEndpoints).mockResolvedValue([{ Id: 7, Name: "dockerhost" }] as never);
    vi.mocked(C.portainerContainers).mockResolvedValue([{ Id: "x", Names: ["/seerr"], State: "running" }] as never);
    vi.mocked(C.portainerRestartContainer).mockResolvedValue(undefined as never);

    await restartServiceContainer("jellyfin");

    expect(C.portainerRestartContainer).toHaveBeenCalledWith("portainer", "7", "seerr");
  });

  it("throws when the container is not found on the pinned endpoint", async () => {
    asAdmin();
    await seed({ containerName: null, portainerEndpointId: "6" });
    vi.mocked(C.portainerContainers).mockResolvedValue([{ Id: "y", Names: ["/other"], State: "running" }] as never);

    await expect(restartServiceContainer("jellyfin")).rejects.toThrow(/not found on the pinned Portainer endpoint/);
    expect(C.portainerEndpoints).not.toHaveBeenCalled();
    expect(C.portainerRestartContainer).not.toHaveBeenCalled();
  });

  it("skips an endpoint whose container listing fails and finds it on the next", async () => {
    asAdmin();
    await seed({ containerName: null, portainerEndpointId: null });
    vi.mocked(C.portainerEndpoints).mockResolvedValue([{ Id: 5, Name: "dev" }, { Id: 6, Name: "nas" }] as never);
    vi.mocked(C.portainerContainers).mockImplementation(async (_s: string, ep: string) => {
      if (ep === "5") throw new Error("agent unreachable");
      return [{ Id: "x", Names: ["/jellyfin"], State: "running" }] as never;
    });
    vi.mocked(C.portainerRestartContainer).mockResolvedValue(undefined as never);

    await restartServiceContainer("jellyfin");

    expect(C.portainerRestartContainer).toHaveBeenCalledWith("portainer", "6", "jellyfin");
  });

  it("throws when the container is not found on any endpoint", async () => {
    asAdmin();
    await seed({ containerName: null, portainerEndpointId: null });
    vi.mocked(C.portainerEndpoints).mockResolvedValue([{ Id: 5, Name: "dev" }, { Id: 6, Name: "nas" }] as never);
    vi.mocked(C.portainerContainers).mockResolvedValue([{ Id: "y", Names: ["/something-else"], State: "running" }] as never);

    await expect(restartServiceContainer("jellyfin")).rejects.toThrow(/not found on any Portainer endpoint/);
    expect(C.portainerRestartContainer).not.toHaveBeenCalled();
  });

  it("throws when no endpoints exist", async () => {
    asAdmin();
    await seed({ containerName: null, portainerEndpointId: null });
    vi.mocked(C.portainerEndpoints).mockResolvedValue([] as never);
    await expect(restartServiceContainer("jellyfin")).rejects.toThrow(/No Portainer endpoints found/);
  });

  it("throws when a Portainer instance exists but has no stored token", async () => {
    asAdmin();
    await seed({ containerName: "jellyfin", portainerEndpointId: "1" });
    await setServiceSecret("portainer", ""); // clear the token
    await expect(restartServiceContainer("jellyfin")).rejects.toThrow(/token is not set/);
    expect(C.portainerRestartContainer).not.toHaveBeenCalled();
  });

  it("throws when no Portainer instance is configured at all", async () => {
    asAdmin();
    await deleteService("portainer");
    await upsertService({ id: "jellyfin", name: "Jellyfin", cat: "stream", icon: "dns", logoSlug: "jellyfin", host: "jf.test", containerName: "jellyfin" });
    await expect(restartServiceContainer("jellyfin")).rejects.toThrow(/Portainer is not configured/);
  });
});
