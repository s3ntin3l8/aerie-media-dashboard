import { describe, it, expect, vi, beforeEach } from "vitest";
import * as schema from "@/lib/db/schema";
import { applyServiceConfig } from "@/lib/config/apply";
import { decrypt } from "@/lib/crypto";

// A minimal Drizzle stand-in: records every insert (table + values) and serves the
// existing-services SELECT used to continue sortOrder. The query builders are awaited,
// so .onConflictDoNothing() / .from() resolve to a promise.
function fakeDb(existing: { id: string }[] = []) {
  const inserts: { table: unknown; values: unknown[] }[] = [];
  const db = {
    insert: (table: unknown) => ({
      values: (values: unknown[]) => {
        inserts.push({ table, values });
        return { onConflictDoNothing: () => Promise.resolve() };
      },
    }),
    select: () => ({ from: () => Promise.resolve(existing) }),
  };
  const valuesFor = (table: unknown) => inserts.find((i) => i.table === table)?.values;
  return { db, inserts, valuesFor };
}

const baseService = { id: "sonarr", name: "Sonarr", cat: "automation", icon: "live_tv", host: "sonarr.lan" };

beforeEach(() => vi.clearAllMocks());

describe("applyServiceConfig", () => {
  it("inserts services with defaults + a synthesized baseUrl, starting sortOrder at 0", async () => {
    const { db, valuesFor } = fakeDb();
    await applyServiceConfig(db as never, { services: [baseService] } as never);
    const svc = (valuesFor(schema.services) as Record<string, unknown>[])[0];
    expect(svc).toMatchObject({ id: "sonarr", baseUrl: "https://sonarr.lan", embeddable: false, active: true, sortOrder: 0 });
  });

  it("maps the Portainer restart fields (containerName, portainerEndpointId)", async () => {
    const { db, valuesFor } = fakeDb();
    await applyServiceConfig(db as never, { services: [
      { ...baseService, containerName: "sonarr", portainerEndpointId: "2" },
    ] } as never);
    const svc = (valuesFor(schema.services) as Record<string, unknown>[])[0];
    expect(svc).toMatchObject({ containerName: "sonarr", portainerEndpointId: "2" });
  });

  it("defaults the Portainer restart fields to null when omitted", async () => {
    const { db, valuesFor } = fakeDb();
    await applyServiceConfig(db as never, { services: [baseService] } as never);
    const svc = (valuesFor(schema.services) as Record<string, unknown>[])[0];
    expect(svc).toMatchObject({ containerName: null, portainerEndpointId: null });
  });

  it("continues sortOrder after services already present in the DB", async () => {
    const { db, valuesFor } = fakeDb([{ id: "radarr" }, { id: "plex" }]);
    await applyServiceConfig(db as never, { services: [baseService] } as never);
    expect((valuesFor(schema.services) as Record<string, unknown>[])[0].sortOrder).toBe(2);
  });

  it("encrypts and stores only the services that resolved a non-empty apiKey", async () => {
    const { db, valuesFor } = fakeDb();
    await applyServiceConfig(db as never, { services: [
      { ...baseService, apiKey: "  secret-token  " },
      { id: "radarr", name: "Radarr", cat: "automation", icon: "movie", host: "radarr.lan", apiKey: "   " },
    ] } as never);
    const secrets = valuesFor(schema.serviceSecrets) as { serviceId: string; iv: string; authTag: string; ciphertext: string }[];
    expect(secrets).toHaveLength(1); // blank apiKey skipped
    expect(secrets[0].serviceId).toBe("sonarr");
    expect(decrypt({ iv: secrets[0].iv, authTag: secrets[0].authTag, ciphertext: secrets[0].ciphertext })).toBe("secret-token"); // trimmed
  });

  it("encrypts a valid forwardAuth config and skips an incomplete one", async () => {
    const { db, inserts } = fakeDb();
    await applyServiceConfig(db as never, { services: [
      { ...baseService, forwardAuth: { method: "bearer", tokenUrl: "https://auth.lan/application/o/token/", clientId: "cid", username: "svc", password: "pw", scope: "openid" } },
      // radarr's password didn't resolve (empty ${ENV}) → invalid → skipped, not fatal.
      { id: "radarr", name: "Radarr", cat: "automation", icon: "movie", host: "radarr.lan", forwardAuth: { method: "bearer", tokenUrl: "https://auth.lan/application/o/token/", clientId: "cid", username: "svc", password: "" } },
    ] } as never);
    // The forwardAuth insert is the only serviceSecrets insert here (no apiKeys).
    const faInsert = inserts.find((i) => i.table === schema.serviceSecrets);
    const secrets = faInsert!.values as { serviceId: string; kind: string; iv: string; authTag: string; ciphertext: string }[];
    expect(secrets).toHaveLength(1); // radarr (empty password) skipped
    expect(secrets[0]).toMatchObject({ serviceId: "sonarr", kind: "forwardAuth" });
    expect(JSON.parse(decrypt({ iv: secrets[0].iv, authTag: secrets[0].authTag, ciphertext: secrets[0].ciphertext }))).toMatchObject({ method: "bearer", clientId: "cid" });
  });

  it("inserts groups and visibility when present, and skips secret insert when no keys", async () => {
    const { db, valuesFor } = fakeDb();
    await applyServiceConfig(db as never, {
      services: [baseService],
      groups: [{ name: "friends", label: "Friends" }],
      visibility: [{ serviceId: "sonarr", groupName: "friends", visible: false }],
    } as never);
    expect(valuesFor(schema.groups)).toEqual([{ name: "friends", label: "Friends" }]);
    expect(valuesFor(schema.serviceVisibility)).toEqual([{ serviceId: "sonarr", groupName: "friends", visible: false }]);
    expect(valuesFor(schema.serviceSecrets)).toBeUndefined();
  });

  it("does nothing destructive on an empty config (no services)", async () => {
    const { db, inserts } = fakeDb();
    await applyServiceConfig(db as never, { services: [] } as never);
    expect(inserts).toHaveLength(0);
  });
});
