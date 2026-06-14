import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { TraefikRoute } from "@/lib/types";

// shared.tsx pulls next/navigation in for PageHeader; RouteBadges itself doesn't route.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { RouteBadges } from "@/components/views/shared";

const route = (over: Partial<TraefikRoute> = {}): TraefikRoute =>
  ({ serviceId: "x", router: "sonarr@docker", rule: "", hosts: ["x.test"], status: "enabled", tls: false, forwardAuth: false, middlewares: [], serverStatus: "up", ...over }) as TraefikRoute;

describe("RouteBadges", () => {
  it("renders nothing for a fully-healthy route with no TLS or cert", () => {
    const { container } = render(<RouteBadges route={route()} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the SSO chip with resolved middleware types and serving node in the tooltip", () => {
    render(<RouteBadges route={route({
      forwardAuth: true,
      middlewares: ["authentik@docker"],
      middlewareDetail: [{ name: "authentik@docker", type: "forwardauth" }],
      instance: "node-01",
    })} />);
    const sso = screen.getByText("SSO");
    expect(sso.title).toContain("authentik@docker (forwardauth)");
    expect(sso.title).toContain("node node-01");
  });

  it("falls back to bare middleware names when no detail is resolved", () => {
    render(<RouteBadges route={route({ forwardAuth: true, middlewares: ["sso@file"] })} />);
    expect(screen.getByText("SSO").title).toContain("forward-auth via sso@file");
  });

  it("flags a down backend with a red route chip and a descriptive tooltip", () => {
    render(<RouteBadges route={route({ serverStatus: "down", instance: "node-02" })} />);
    const chip = screen.getByText("route");
    expect(chip.title).toContain("backend down");
    expect(chip.title).toContain("node node-02");
  });

  it("flags a non-enabled router status as a route problem", () => {
    render(<RouteBadges route={route({ status: "warning" })} />);
    expect(screen.getByText("route").title).toContain("router warning");
  });

  it("renders a cert chip with richer issuer/resolver/keyType detail and days-left", () => {
    render(<RouteBadges route={route({ tls: true, cert: {
      notAfter: 1_900_000_000, daysRemaining: 5, domains: ["x.test"],
      issuer: "Let's Encrypt", resolver: "letsencrypt", keyType: "EC256",
    } })} />);
    const cert = screen.getByText("cert 5d");
    expect(cert.title).toContain("issuer Let's Encrypt");
    expect(cert.title).toContain("resolver letsencrypt");
    expect(cert.title).toContain("EC256");
    expect(cert.title).toContain("5d left");
  });

  it("shows 'cert expired' when daysRemaining is negative", () => {
    render(<RouteBadges route={route({ tls: true, cert: { notAfter: 1_600_000_000, daysRemaining: -3, domains: ["x.test"] } })} />);
    expect(screen.getByText("cert expired")).toBeInTheDocument();
  });

  it("renders only a lock icon when TLS is on but no cert detail is known", () => {
    const { container } = render(<RouteBadges route={route({ tls: true })} />);
    // No cert text, but the lock icon (a material symbol) is present.
    expect(screen.queryByText(/cert/)).not.toBeInTheDocument();
    expect(container.textContent).toContain("lock");
  });
});
