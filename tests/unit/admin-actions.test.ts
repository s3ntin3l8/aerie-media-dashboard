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
}));

import { db, schema } from "@/lib/db/client";
import { ensureDb } from "@/lib/db/bootstrap";
import { getDeploymentSetting } from "@/lib/integrations/registry";
import { getSessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import * as C from "@/lib/integrations/clients";
import {
  upsertService, setServiceKeepAlive, setVisibility, setServiceSecret, setServiceForwardAuth, clearServiceForwardAuth, setServiceActive,
  serviceExists, deleteService, detectServiceVersion, setMetricsSource, setQueueSource,
  setBeszelSystem, setPrometheusInstance, setUserOverseerrQuota,
  dismissTraefikHost, restoreTraefikHost,
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
