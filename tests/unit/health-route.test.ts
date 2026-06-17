import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockEnsureDb } = vi.hoisted(() => ({ mockEnsureDb: vi.fn() }));
vi.mock("@/lib/db/bootstrap", () => ({ ensureDb: mockEnsureDb }));

import { GET } from "@/app/api/health/route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/health", () => {
  it("returns 200 {status:'ok'} when the DB is reachable", async () => {
    mockEnsureDb.mockResolvedValue(undefined);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 503 {status:'error'} when ensureDb throws", async () => {
    mockEnsureDb.mockRejectedValue(new Error("SQLITE_CANTOPEN"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error" });
  });

  it("does not leak the error message in the response body", async () => {
    mockEnsureDb.mockRejectedValue(new Error("secret internal detail"));
    const res = await GET();
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret internal detail");
  });
});
