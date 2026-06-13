import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { TraefikRoute, AuthentikAccess } from "@/lib/types";

// shared.tsx imports next/navigation for PageHeader; MetaBadges itself doesn't use the router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MetaBadges } from "@/components/views/shared";

const route = (over: Partial<TraefikRoute> = {}): TraefikRoute =>
  ({ serviceId: "x", router: "x@docker", rule: "", hosts: ["x.test"], status: "enabled", tls: true, forwardAuth: true, middlewares: ["authentik@docker"], serverStatus: "up", cert: { notAfter: 1_900_000_000, daysRemaining: 12, domains: ["x.test"] }, ...over }) as TraefikRoute;
const access = (over: Partial<AuthentikAccess> = {}): AuthentikAccess =>
  ({ serviceId: "x", appName: "X", appSlug: "x", host: "x.test", providerName: null, providerType: null, everyone: false, groups: ["family"], users: 0, policyGated: false, ...over }) as AuthentikAccess;

describe("MetaBadges", () => {
  it("renders the route SSO + cert chips and the Authentik access chip together", () => {
    render(<MetaBadges cat="automation" route={route()} access={access()} />);
    expect(screen.getByText("SSO")).toBeInTheDocument();
    expect(screen.getByText("cert 12d")).toBeInTheDocument(); // amber threshold (<14d)
    expect(screen.getByText("family")).toBeInTheDocument();
  });

  it("renders nothing route/access-wise when only a category is given", () => {
    const { container } = render(<MetaBadges cat="infra" />);
    // CatBadge still renders, but no SSO/cert/access text
    expect(screen.queryByText("SSO")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("cert");
  });

  it("shows 'everyone' for an unrestricted Authentik app", () => {
    render(<MetaBadges route={route({ forwardAuth: false, cert: undefined })} access={access({ everyone: true, groups: [] })} />);
    expect(screen.getByText("everyone")).toBeInTheDocument();
  });
});
