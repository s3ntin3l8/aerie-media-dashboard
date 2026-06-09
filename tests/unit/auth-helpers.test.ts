import { describe, it, expect } from "vitest";
import { normalizeGroups, deriveRole } from "@/lib/auth/role";
import { env } from "@/lib/env";

const ADMIN_GROUP = env.adminGroup;
const ADMIN_EMAILS = env.adminEmails;

describe("normalizeGroups", () => {
  it("passes through an array of strings", () => {
    expect(normalizeGroups(["admins", "users"])).toEqual(["admins", "users"]);
  });

  it("splits a comma-separated string", () => {
    expect(normalizeGroups("admins,users,devs")).toEqual(["admins", "users", "devs"]);
  });

  it("splits a space-separated string", () => {
    expect(normalizeGroups("admins users devs")).toEqual(["admins", "users", "devs"]);
  });

  it("splits a mixed comma-and-space string", () => {
    expect(normalizeGroups("admins, users  devs")).toEqual(["admins", "users", "devs"]);
  });

  it("returns empty array for empty string", () => {
    expect(normalizeGroups("")).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(normalizeGroups(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(normalizeGroups(undefined)).toEqual([]);
  });

  it("converts array of numbers to strings", () => {
    expect(normalizeGroups([1, 2, 3])).toEqual(["1", "2", "3"]);
  });
});

describe("deriveRole", () => {
  it("returns admin when groups contain admin group", () => {
    expect(deriveRole(["admins", "users"], "user@example.com", ADMIN_GROUP, ADMIN_EMAILS)).toBe("admin");
  });

  it("returns admin when email is in adminEmails", () => {
    expect(deriveRole(["users"], "admin@example.com", "admins", ["admin@example.com"])).toBe("admin");
  });

  it("returns user when neither in admin group nor admin email", () => {
    expect(deriveRole(["users"], "user@example.com", ADMIN_GROUP, ADMIN_EMAILS)).toBe("user");
  });

  it("returns user when groups are empty and email is not admin", () => {
    expect(deriveRole([], "user@example.com", ADMIN_GROUP, ADMIN_EMAILS)).toBe("user");
  });

  it("is case-insensitive for email matching", () => {
    expect(deriveRole(["users"], "Admin@Example.com", "admins", ["admin@example.com"])).toBe("admin");
  });

  it("returns admin when both group and email match", () => {
    expect(deriveRole(["admins"], "admin@example.com", "admins", ["admin@example.com"])).toBe("admin");
  });

  it("returns user with no email", () => {
    expect(deriveRole(["users"], undefined, ADMIN_GROUP, ADMIN_EMAILS)).toBe("user");
  });
});
