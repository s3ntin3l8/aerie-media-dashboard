import { describe, it, expect } from "vitest";
import { configMatchesLogo } from "@/lib/integrations/registry";

// configMatchesLogo is pure (no DB): true when a service is an instance of a preset logo, by its
// stored logoSlug OR by its id/name resolving to that preset. This is what lets renamed instances
// (traefik-unraid / traefik-dockerhost, logoSlug "traefik") be recognised as Traefik.
const cfg = (over: { id?: string; name?: string; logoSlug?: string | null }) =>
  ({ id: "x", name: "X", logoSlug: null, ...over });

describe("configMatchesLogo", () => {
  it("matches on the stored logoSlug regardless of id/name", () => {
    expect(configMatchesLogo(cfg({ id: "traefik-dockerhost", name: "traefik dockerhost", logoSlug: "traefik" }), "traefik")).toBe(true);
    expect(configMatchesLogo(cfg({ id: "traefik-unraid", logoSlug: "traefik" }), "traefik")).toBe(true);
  });

  it("falls back to a preset match on id or name when logoSlug is unset", () => {
    expect(configMatchesLogo(cfg({ id: "traefik", logoSlug: null }), "traefik")).toBe(true);
    expect(configMatchesLogo(cfg({ id: "my-svc", name: "Traefik", logoSlug: null }), "traefik")).toBe(true);
  });

  it("returns false for unrelated services", () => {
    expect(configMatchesLogo(cfg({ id: "sonarr", logoSlug: "sonarr" }), "traefik")).toBe(false);
    expect(configMatchesLogo(cfg({ id: "custom", name: "Custom", logoSlug: null }), "traefik")).toBe(false);
  });
});
