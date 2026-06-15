import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { KeepAliveCell, AccessCell, ProxyAccessCell, CertCell, SsoCell } from "@/components/views/shared";
import type { Service, TraefikRoute, AuthentikAccess } from "@/lib/types";

// Minimal factories — only the fields the cells read matter.
const svc = (o: Partial<Service> = {}): Service =>
  ({ id: "x", name: "X", scheme: "https", embeddable: true, keepAlive: true, ...o }) as Service;
const route = (o: Partial<TraefikRoute> = {}): TraefikRoute =>
  ({ serviceId: "x", router: "x@docker", rule: "", hosts: ["x.test"], status: "enabled", tls: true, forwardAuth: false, middlewares: [], serverStatus: "up", ...o }) as TraefikRoute;
const cert = (daysRemaining = 20) =>
  ({ domains: ["x.test"], notAfter: 1893456000, daysRemaining, issuer: "LE", resolver: "le", keyType: "ECDSA" }) as NonNullable<TraefikRoute["cert"]>;
const access = (o: Partial<AuthentikAccess> = {}): AuthentikAccess =>
  ({ serviceId: "x", appName: "X", appSlug: "x", host: "x.test", providerName: null, providerType: null, everyone: false, groups: [], users: 0, policyGated: false, ...o }) as AuthentikAccess;

describe("KeepAliveCell", () => {
  it("renders nothing for a non-keep-alive service (no reserve)", () => {
    const { container } = render(<KeepAliveCell service={svc({ keepAlive: false })} live={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a muted dash when reserved and not keep-alive", () => {
    render(<KeepAliveCell service={svc({ keepAlive: false })} live={false} reserve />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("distinguishes flagged-idle from live by tooltip", () => {
    const { rerender } = render(<KeepAliveCell service={svc()} live={false} iconOnly />);
    expect(screen.getByTitle(/persists in the background/i)).toBeInTheDocument();
    rerender(<KeepAliveCell service={svc()} live iconOnly />);
    expect(screen.getByTitle(/running in the background now/i)).toBeInTheDocument();
  });
});

describe("AccessCell", () => {
  it("shows a dash when reserved and no access", () => {
    render(<AccessCell reserve />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("labels everyone-access", () => {
    render(<AccessCell access={access({ everyone: true })} />);
    expect(screen.getByText("everyone")).toBeInTheDocument();
  });

  it("labels a single bound group by name", () => {
    render(<AccessCell access={access({ groups: ["media"] })} />);
    expect(screen.getByText("media")).toBeInTheDocument();
  });
});

describe("ProxyAccessCell (consolidated proxy + access column)", () => {
  it("shows a dash when reserved and the service has no route or access", () => {
    render(<ProxyAccessCell reserve />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders nothing (no dash) without reserve when empty", () => {
    const { container } = render(<ProxyAccessCell />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows SSO, cert expiry and Authentik access together", () => {
    render(
      <ProxyAccessCell
        route={route({ forwardAuth: true, cert: cert(20) })}
        access={access({ everyone: true })}
      />,
    );
    expect(screen.getByText("SSO")).toBeInTheDocument();
    expect(screen.getByText(/cert 20d/)).toBeInTheDocument();
    expect(screen.getByText("everyone")).toBeInTheDocument();
  });
});

describe("CertCell / SsoCell", () => {
  it("renders the cert chip with remaining days", () => {
    render(<CertCell route={route({ cert: cert(2) })} />);
    expect(screen.getByText(/cert 2d/)).toBeInTheDocument();
  });

  it("shows a dash for SSO when reserved and no route", () => {
    render(<SsoCell reserve />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
