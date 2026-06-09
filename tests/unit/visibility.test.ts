import { describe, it, expect } from "vitest";
import { isVisible, defaultVisibleToMembers } from "@/lib/visibility";

interface VisibilityRow {
  serviceId: string;
  groupName: string;
  visible: boolean;
}

const makeRow = (serviceId: string, groupName: string, visible: boolean): VisibilityRow =>
  ({ serviceId, groupName, visible });

describe("defaultVisibleToMembers", () => {
  it("returns true for stream", () => {
    expect(defaultVisibleToMembers("stream")).toBe(true);
  });
  it("returns true for request", () => {
    expect(defaultVisibleToMembers("request")).toBe(true);
  });
  it("returns false for automation", () => {
    expect(defaultVisibleToMembers("automation")).toBe(false);
  });
  it("returns false for monitor", () => {
    expect(defaultVisibleToMembers("monitor")).toBe(false);
  });
  it("returns false for infra", () => {
    expect(defaultVisibleToMembers("infra")).toBe(false);
  });
});

describe("isVisible", () => {
  it("always returns true for admin role", () => {
    expect(isVisible({ id: "svc1", cat: "infra" }, "admin", [makeRow("svc1", "friends", false)])).toBe(true);
  });

  it("returns true for stream services with no visibility rules", () => {
    expect(isVisible({ id: "plex", cat: "stream" }, "user", [])).toBe(true);
  });

  it("returns false for infra services with no visibility rules", () => {
    expect(isVisible({ id: "gatus", cat: "infra" }, "user", [])).toBe(false);
  });

  it("returns true when visible=true rule exists", () => {
    const rules = [makeRow("svc1", "friends", true)];
    expect(isVisible({ id: "svc1", cat: "infra" }, "user", rules)).toBe(true);
  });

  it("returns false when visible=false rule exists", () => {
    const rules = [makeRow("svc1", "friends", false)];
    expect(isVisible({ id: "svc1", cat: "stream" }, "user", rules)).toBe(false);
  });

  it("defaults to category visibility when no rule matches the service", () => {
    const rules = [makeRow("other-svc", "friends", false)];
    expect(isVisible({ id: "svc1", cat: "stream" }, "user", rules)).toBe(true);
    expect(isVisible({ id: "svc1", cat: "infra" }, "user", rules)).toBe(false);
  });

  it("ignores rules for groups other than friends", () => {
    const rules = [makeRow("svc1", "admins", false)];
    expect(isVisible({ id: "svc1", cat: "stream" }, "user", rules)).toBe(true);
  });
});