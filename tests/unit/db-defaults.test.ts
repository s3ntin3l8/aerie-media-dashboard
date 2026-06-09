import { describe, it, expect } from "vitest";
import { DEFAULT_GROUPS } from "@/lib/db/defaults";

describe("DEFAULT_GROUPS", () => {
  it("defines three groups", () => {
    expect(DEFAULT_GROUPS).toHaveLength(3);
  });

  it("has admins, friends, and guests", () => {
    expect(DEFAULT_GROUPS).toEqual([
      ["admins", "Admins"],
      ["friends", "Friends"],
      ["guests", "Guests"],
    ]);
  });

  it("each group has a name and label", () => {
    for (const [name, label] of DEFAULT_GROUPS) {
      expect(name).toBeTruthy();
      expect(label).toBeTruthy();
    }
  });
});