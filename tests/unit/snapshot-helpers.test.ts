import { describe, it, expect } from "vitest";
import { padBeats, safe, scopeTraefikInstances } from "@/lib/data/snapshot";
import type { TraefikInstance, TraefikRoute } from "@/lib/types";

describe("padBeats", () => {
  it("pads a short array to 30 elements with leading 1s", () => {
    const result = padBeats([1, 0, 1]);
    expect(result).toHaveLength(30);
    expect(result.slice(0, 27)).toEqual(Array(27).fill(1));
    expect(result.slice(27)).toEqual([1, 0, 1]);
  });

  it("returns a 30-element array when input is empty", () => {
    const result = padBeats([]);
    expect(result).toHaveLength(30);
    expect(result.every((b) => b === 1)).toBe(true);
  });

  it("truncates arrays longer than 30 to the last 30", () => {
    const long = Array(50).fill(0).map((_, i) => i % 3);
    const result = padBeats(long);
    expect(result).toHaveLength(30);
    expect(result).toEqual(long.slice(-30));
  });

  it("passes through an exact 30-element array unchanged", () => {
    const exact30 = Array(30).fill(1);
    const result = padBeats(exact30);
    expect(result).toEqual(exact30);
  });

  it("pads a single element", () => {
    const result = padBeats([0]);
    expect(result).toHaveLength(30);
    expect(result.slice(0, 29)).toEqual(Array(29).fill(1));
    expect(result[29]).toBe(0);
  });
});

describe("safe", () => {
  it("returns the resolved value on success", async () => {
    const result = await safe(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("returns null when the function throws", async () => {
    const result = await safe(() => Promise.reject(new Error("fail")));
    expect(result).toBeNull();
  });

  it("returns null for a synchronous throw", async () => {
    const result = await safe(() => {
      throw new Error("sync fail");
    });
    expect(result).toBeNull();
  });

  it("returns an object value on success", async () => {
    const data = { id: 1, name: "test" };
    const result = await safe(() => Promise.resolve(data));
    expect(result).toEqual(data);
  });

  it("returns null for a string reject", async () => {
    const result = await safe(() => Promise.reject("string error"));
    expect(result).toBeNull();
  });
});

describe("scopeTraefikInstances", () => {
  const node = (name: string, status: TraefikInstance["status"] = "ok"): TraefikInstance => ({ name, status });
  const svc = (id: string, instance?: string) => ({ id, route: instance ? ({ instance } as TraefikRoute) : undefined });

  it("keeps only nodes that route a configured service, attaching the served ids", () => {
    const instances = [node("node-01"), node("node-02"), node("node-99")];
    const services = [svc("sonarr", "node-01"), svc("lidarr", "node-01"), svc("radarr", "node-02"), svc("plex" /* no route */)];
    const scoped = scopeTraefikInstances(instances, services);
    // node-99 serves nothing configured → dropped.
    expect(scoped.map((n) => n.name)).toEqual(["node-01", "node-02"]);
    expect(scoped.find((n) => n.name === "node-01")!.serves).toEqual(["sonarr", "lidarr"]);
    expect(scoped.find((n) => n.name === "node-02")!.serves).toEqual(["radarr"]);
  });

  it("returns [] when no service has a correlated route instance", () => {
    expect(scopeTraefikInstances([node("node-01")], [svc("plex"), svc("jellyfin")])).toEqual([]);
  });

  it("returns [] when there are no instances (no aggregator source)", () => {
    expect(scopeTraefikInstances([], [svc("sonarr", "node-01")])).toEqual([]);
  });
});