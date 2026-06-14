import { describe, it, expect } from "vitest";
import { embedAuthSummary, accessLabel } from "@/components/views/embedAuth";
import type { Service, TraefikRoute, AuthentikAccess } from "@/lib/types";

// Minimal Service factory — only the fields embedAuthSummary reads matter.
const svc = (over: Partial<Service> = {}): Service =>
  ({ id: "x", name: "X", scheme: "https", ...over }) as Service;
const route = (over: Partial<TraefikRoute> = {}): TraefikRoute =>
  ({ serviceId: "x", router: "x@docker", rule: "", hosts: ["x.test"], status: "enabled", tls: true, forwardAuth: false, middlewares: [], serverStatus: "up", ...over }) as TraefikRoute;
const access = (over: Partial<AuthentikAccess> = {}): AuthentikAccess =>
  ({ serviceId: "x", appName: "X", appSlug: "x", host: "x.test", providerName: null, providerType: null, everyone: false, groups: [], users: 0, policyGated: false, ...over }) as AuthentikAccess;

describe("accessLabel", () => {
  it("summarises the access binding", () => {
    expect(accessLabel(access({ everyone: true }))).toBe("everyone");
    expect(accessLabel(access({ groups: [] }))).toBe("restricted");
    expect(accessLabel(access({ groups: ["media"] }))).toBe("media");
    expect(accessLabel(access({ groups: ["a", "b", "c"] }))).toBe("3 groups");
  });
});

describe("embedAuthSummary — auth label", () => {
  it("no route, OIDC on → global forward-auth hint", () => {
    const r = embedAuthSummary(svc(), "Ada", true);
    expect(r.behindSso).toBe(false);
    expect(r.authText).toBe("forward-auth · Ada");
    expect(r.authIcon).toBe("shield_person");
    expect(r.authColor).toBe("var(--on-surface-variant)");
  });

  it("no route, OIDC off → just the user", () => {
    expect(embedAuthSummary(svc(), "Ada", false).authText).toBe("Ada");
  });

  it("route with forward-auth middleware → behind SSO", () => {
    const r = embedAuthSummary(svc({ route: route({ forwardAuth: true, middlewares: ["authentik@docker"] }) }), "Ada", false);
    expect(r.behindSso).toBe(true);
    expect(r.authText).toBe("forward-auth · Ada");
    expect(r.authColor).toBe("var(--primary)");
    expect(r.authTitle).toContain("middlewares: authentik@docker");
  });

  it("route without forward-auth → direct (lock_open)", () => {
    const r = embedAuthSummary(svc({ route: route({ forwardAuth: false }) }), "Ada", true);
    expect(r.behindSso).toBe(false);
    expect(r.authText).toBe("direct · Ada");
    expect(r.authIcon).toBe("lock_open");
    expect(r.authTitle).toContain("middlewares: none");
  });

  it("Authentik access takes the label and forces behind-SSO even without a route", () => {
    const r = embedAuthSummary(svc({ authentik: access({ groups: ["family"] }) }), "Ada", false);
    expect(r.behindSso).toBe(true);
    expect(r.authText).toBe("forward-auth · family");
    expect(r.authTitle).toContain("Authentik: family");
  });

  it("Authentik 'everyone' renders as everyone", () => {
    expect(embedAuthSummary(svc({ authentik: access({ everyone: true }) }), "Ada", false).authText).toBe("forward-auth · everyone");
  });

  it("prefers resolved middleware types and notes the serving node in the tooltip", () => {
    const r = embedAuthSummary(svc({ route: route({
      forwardAuth: true,
      middlewares: ["authentik@docker"],
      middlewareDetail: [{ name: "authentik@docker", type: "forwardauth" }],
      instance: "node-01",
    }) }), "Ada", false);
    expect(r.authTitle).toContain("middlewares: authentik@docker (forwardauth)");
    expect(r.authTitle).toContain("served by node: node-01");
  });
});

describe("embedAuthSummary — lock colour + cert tooltip", () => {
  const certRoute = (daysRemaining: number) => route({ cert: { notAfter: 1_900_000_000, daysRemaining, domains: ["x.test"] } });

  it("colours the lock by cert days remaining (red <3, amber <14, else own)", () => {
    expect(embedAuthSummary(svc({ route: certRoute(1) }), "a", false).lockColor).toBe("var(--error)");
    expect(embedAuthSummary(svc({ route: certRoute(10) }), "a", false).lockColor).toBe("var(--amber)");
    expect(embedAuthSummary(svc({ route: certRoute(40) }), "a", false).lockColor).toBe("var(--originator-own)");
  });

  it("cert tooltip notes domains + days left, and 'expired' when negative", () => {
    const t = embedAuthSummary(svc({ route: certRoute(40) }), "a", false).lockTitle;
    expect(t).toContain("TLS cert for x.test");
    expect(t).toContain("(40d left)");
    expect(embedAuthSummary(svc({ route: certRoute(-1) }), "a", false).lockTitle).toContain("expired");
  });

  it("no cert → scheme-based lock (https own / http amber)", () => {
    expect(embedAuthSummary(svc({ scheme: "https" }), "a", false).lockTitle).toBe("HTTPS");
    expect(embedAuthSummary(svc({ scheme: "https" }), "a", false).lockColor).toBe("var(--originator-own)");
    const http = embedAuthSummary(svc({ scheme: "http" }), "a", false);
    expect(http.lockColor).toBe("var(--amber)");
    expect(http.lockTitle).toBe("HTTP — not encrypted");
  });

  it("appends issuer/resolver/keyType to the cert tooltip when the aggregator supplies them", () => {
    const t = embedAuthSummary(svc({ route: route({ cert: {
      notAfter: 1_900_000_000, daysRemaining: 20, domains: ["x.test"],
      issuer: "Let's Encrypt", resolver: "letsencrypt", keyType: "EC256",
    } }) }), "a", false).lockTitle;
    expect(t).toContain("issuer Let's Encrypt");
    expect(t).toContain("resolver letsencrypt");
    expect(t).toContain("EC256");
  });
});
