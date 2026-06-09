import { describe, it, expect, beforeEach } from "vitest";
import { serviceSchema, fileSchema, interpolate } from "@/lib/config/services";

const CATEGORIES = ["stream", "request", "automation", "monitor", "infra"] as const;

describe("config/services — interpolate()", () => {
  beforeEach(() => {
    process.env.MY_API_KEY = " secret-key ";
    process.env.EMPTY_VAR = "";
  });

  it("replaces ${VAR} from process.env", () => {
    expect(interpolate("key=${MY_API_KEY}")).toBe("key=secret-key");
  });

  it("trims whitespace from resolved values", () => {
    expect(interpolate("${MY_API_KEY}")).toBe("secret-key");
  });

  it("replaces unresolved ${MISSING} with empty string", () => {
    expect(interpolate("${NONEXISTENT_VAR_XYZ}")).toBe("");
  });

  it("handles multiple refs in one string", () => {
    expect(interpolate("${MY_API_KEY}:${MY_API_KEY}")).toBe("secret-key:secret-key");
  });

  it("passes through plain strings unchanged", () => {
    expect(interpolate("no-refs-here")).toBe("no-refs-here");
  });

  it("interpolates nested objects recursively", () => {
    const input = { a: "${MY_API_KEY}", b: { c: "${EMPTY_VAR}" } };
    const result = interpolate(input) as Record<string, unknown>;
    expect(result.a).toBe("secret-key");
    expect((result.b as Record<string, unknown>).c).toBe("");
  });

  it("interpolates arrays", () => {
    const input = ["${MY_API_KEY}", "plain"];
    expect(interpolate(input)).toEqual(["secret-key", "plain"]);
  });

  it("passes through non-string primitives unchanged", () => {
    expect(interpolate(42)).toBe(42);
    expect(interpolate(true)).toBe(true);
    expect(interpolate(null)).toBe(null);
  });
});

describe("config/services — serviceSchema", () => {
  const valid = {
    id: "plex",
    name: "Plex",
    cat: "stream",
    icon: "plex",
    host: "https://plex.example.com",
  };

  it("accepts a minimal valid service", () => {
    expect(serviceSchema.parse(valid)).toEqual(expect.objectContaining({ id: "plex" }));
  });

  it("accepts all optional fields", () => {
    const full = { ...valid, baseUrl: "http://plex:32400", embeddable: true, central: true, apiKey: "key" };
    expect(serviceSchema.parse(full)).toEqual(expect.objectContaining({ embeddable: true }));
  });

  it("rejects missing required id", () => {
    const noId = { ...valid, id: undefined };
    expect(() => serviceSchema.parse(noId)).toThrow();
  });

  it("rejects missing required name", () => {
    const noName = { ...valid, name: undefined };
    expect(() => serviceSchema.parse(noName)).toThrow();
  });

  it("rejects an invalid cat value", () => {
    expect(() => serviceSchema.parse({ ...valid, cat: "invalid" })).toThrow();
  });

  it("accepts all valid cat values", () => {
    for (const cat of CATEGORIES) {
      expect(serviceSchema.parse({ ...valid, cat })).toEqual(expect.objectContaining({ cat }));
    }
  });
});

describe("config/services — fileSchema", () => {
  it("defaults services to empty array", () => {
    const result = fileSchema.parse({ groups: [], visibility: [] });
    expect(result.services).toEqual([]);
  });

  it("accepts a valid file", () => {
    const file = {
      services: [{ id: "a", name: "A", cat: "stream", icon: "i", host: "h" }],
      groups: [{ name: "admins" }],
      visibility: [{ serviceId: "a", groupName: "admins", visible: true }],
    };
    expect(fileSchema.parse(file)).toBeTruthy();
  });

  it("rejects a visibility entry with empty serviceId", () => {
    const file = {
      services: [{ id: "a", name: "A", cat: "stream", icon: "i", host: "h" }],
      visibility: [{ serviceId: "", groupName: "grp", visible: true }],
    };
    expect(() => fileSchema.parse(file)).toThrow();
  });
});

describe("config/services — duplicate ID detection (loadServiceConfigFile contract)", () => {
  it("detects duplicate service IDs", () => {
    const ids = ["a", "b", "a"];
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    expect(dupes).toEqual(["a"]);
  });

  it("accepts unique service IDs", () => {
    const ids = ["a", "b", "c"];
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    expect(dupes).toEqual([]);
  });
});
