import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/env", () => ({ authConfigured: false }));
vi.mock("@/lib/integrations/registry", () => ({
  createLocalAdmin: vi.fn(), localAdminExists: vi.fn(async () => false),
  setFavorites: vi.fn(), setDashboards: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { createLocalAdmin, localAdminExists, setFavorites, setDashboards } from "@/lib/integrations/registry";
import { getSessionUser } from "@/lib/session";
import { signInWithPassword, createInitialAdmin } from "@/app/login/actions";
import { signOutAction, setFavoritesAction, setDashboardsAction } from "@/app/(portal)/actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(localAdminExists).mockResolvedValue(false); });

describe("signInWithPassword", () => {
  it("requires both fields", async () => {
    expect(await signInWithPassword({}, fd({ email: "" }))).toEqual({ error: "Enter your email and password." });
  });
  it("maps an AuthError to an invalid-credentials message", async () => {
    vi.mocked(signIn).mockRejectedValue(new AuthError());
    expect(await signInWithPassword({}, fd({ email: "a@x", password: "pw" }))).toEqual({ error: "Invalid email or password." });
  });
  it("returns clean state when sign-in resolves", async () => {
    vi.mocked(signIn).mockResolvedValue(undefined as never);
    expect(await signInWithPassword({}, fd({ email: "a@x", password: "pw" }))).toEqual({});
  });
});

describe("createInitialAdmin", () => {
  it("refuses when an admin already exists", async () => {
    vi.mocked(localAdminExists).mockResolvedValue(true);
    expect(await createInitialAdmin({}, fd({}))).toEqual({ error: "An admin account already exists." });
  });
  it("validates input before creating", async () => {
    const r = await createInitialAdmin({}, fd({ name: "", email: "bad", password: "x", confirm: "y" }));
    expect(r.error).toBeTruthy();
    expect(createLocalAdmin).not.toHaveBeenCalled();
  });
  it("creates the admin and signs in on valid input", async () => {
    vi.mocked(signIn).mockResolvedValue(undefined as never);
    const r = await createInitialAdmin({}, fd({ name: "Ada Lovelace", email: "ada@example.com", password: "longpassword1", confirm: "longpassword1" }));
    expect(r).toEqual({});
    expect(createLocalAdmin).toHaveBeenCalledWith({ name: "Ada Lovelace", email: "ada@example.com", password: "longpassword1" });
  });
});

describe("portal actions", () => {
  it("signOutAction delegates to auth signOut", async () => {
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
  it("setFavoritesAction skips the anon guest", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "anon" } as never);
    await setFavoritesAction(["x"]);
    expect(setFavorites).not.toHaveBeenCalled();
  });
  it("setFavoritesAction persists for a real user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1" } as never);
    await setFavoritesAction(["radarr"]);
    expect(setFavorites).toHaveBeenCalledWith("u1", ["radarr"]);
  });
  it("setDashboardsAction persists for a real user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1" } as never);
    await setDashboardsAction({ admin: [] } as never);
    expect(setDashboards).toHaveBeenCalledWith("u1", { admin: [] });
  });
});
