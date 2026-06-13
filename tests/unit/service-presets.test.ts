import { describe, it, expect } from "vitest";
import { matchPreset, serviceRequiresKey } from "@/lib/servicePresets";

describe("matchPreset", () => {
  it("matches by normalized name or id (case/separator insensitive)", () => {
    expect(matchPreset("qBittorrent")?.logoSlug).toBe("qbittorrent");
    expect(matchPreset("home-assistant")?.logoSlug).toBe("home-assistant");
    expect(matchPreset("NZB Get")?.logoSlug).toBe("nzbget");
    expect(matchPreset("unknown-custom-service")).toBeNull();
  });

  it("describes credential-pair services as userpass with a format hint", () => {
    expect(matchPreset("beszel")?.secret).toMatchObject({ kind: "userpass", placeholder: "email:password" });
    expect(matchPreset("nzbget")?.secret).toMatchObject({ kind: "userpass", placeholder: "username:password" });
    expect(matchPreset("qbittorrent")?.secret).toMatchObject({ kind: "userpass", placeholder: "username:password" });
  });

  it("marks no-auth / key-optional services as optional (orthogonal to format)", () => {
    expect(matchPreset("gatus")?.secret?.optional).toBe(true);
    expect(matchPreset("prometheus")?.secret?.optional).toBe(true);
    // NZBGet keeps its userpass *format* while still being optional auth.
    expect(matchPreset("nzbget")?.secret).toMatchObject({ kind: "userpass", optional: true });
    // Plex token is accepted but never required (data comes via Tautulli/Overseerr).
    expect(matchPreset("plex")?.secret).toMatchObject({ kind: "apiKey", optional: true });
  });
});

describe("serviceRequiresKey", () => {
  it("is false only for key-optional types", () => {
    expect(serviceRequiresKey("gatus")).toBe(false);
    expect(serviceRequiresKey("prometheus")).toBe(false);
    expect(serviceRequiresKey("nzbget")).toBe(false); // optional auth
    expect(serviceRequiresKey("plex")).toBe(false); // token optional; no panel depends on it
  });

  it("is true for token services, credential-pair services, and unknown/custom services", () => {
    expect(serviceRequiresKey("sonarr")).toBe(true); // plain apiKey, no explicit descriptor
    expect(serviceRequiresKey("beszel")).toBe(true); // userpass still needs credentials
    expect(serviceRequiresKey("some-custom-thing")).toBe(true); // unknown → assume a key is wanted
  });

  it("falls back to logoSlug so renamed instances resolve to their (optional) preset", () => {
    // A renamed Traefik instance whose id no longer matches the preset, but whose logoSlug does.
    expect(serviceRequiresKey("traefik-dockerhost")).toBe(true); // without the logo hint → unknown → wants key
    expect(serviceRequiresKey("traefik-dockerhost", "traefik")).toBe(false); // logo hint → optional
    expect(serviceRequiresKey("traefik-unraid", "traefik")).toBe(false);
    // A custom id with a non-optional logo stays required.
    expect(serviceRequiresKey("my-sonarr", "sonarr")).toBe(true);
  });
});
