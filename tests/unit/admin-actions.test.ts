import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";

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
import { getSessionUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { upsertService, setServiceKeepAlive } from "@/app/(portal)/admin/actions";

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
