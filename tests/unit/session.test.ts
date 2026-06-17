import { describe, it, expect, vi, beforeEach } from "vitest";

// getSessionUser reads the Auth.js session and best-effort mirrors the user into the DB.
// Stub both so the test covers the field derivation + guest fallback with no auth/DB.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/integrations/registry", () => ({ mirrorUser: vi.fn() }));

import { auth } from "@/auth";
import { mirrorUser } from "@/lib/integrations/registry";
import { getSessionUser } from "@/lib/session";

beforeEach(() => vi.clearAllMocks());

describe("getSessionUser", () => {
  it("returns a guest and does not mirror when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect(await getSessionUser()).toEqual({ id: "anon", name: "Guest", email: "", role: "user", groups: [] });
    expect(mirrorUser).not.toHaveBeenCalled();
  });

  it("maps a full OIDC session and mirrors it", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "sub-123", email: "ada@x", name: "Ada", role: "admin", groups: ["admins"] } } as never);
    const u = await getSessionUser();
    expect(u).toEqual({ id: "sub-123", name: "Ada", email: "ada@x", role: "admin", groups: ["admins"] });
    expect(mirrorUser).toHaveBeenCalledWith({ id: "sub-123", name: "Ada", email: "ada@x", role: "admin" });
  });

  it("falls back to email then name when session.user.id is absent", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "bo@x", name: "Bo" } } as never);
    const u = await getSessionUser();
    expect(u.id).toBe("bo@x");
  });

  it("falls back to name when both id and email are absent", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { name: "Bo" } } as never);
    const u = await getSessionUser();
    expect(u.id).toBe("Bo");
  });
});
