import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { Service } from "@/lib/types";

// Tests for ServiceCard — the enhanced browse+launch+health card in the merged Services page.
// Asserts the Heartbeat strip (24h label) for monitored services, the "not monitored" fallback
// for unknown-status services, EMBED/LAUNCH tag, security signals, and the note line invariant.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/status" }));
// ServiceCard transitively pulls in server actions via panels; stub the module for jsdom.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));

const portal = {
  role: "admin", user: { name: "Ada", email: "a@x" }, oidc: true,
  favorites: [], toggleFavorite: vi.fn(), keptAliveIds: ["sonarr"],
};
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));

beforeEach(() => { vi.clearAllMocks(); portal.favorites = []; });

import { ServiceCard } from "@/components/views/ServiceCard";

const route = (o: Record<string, unknown> = {}) => ({
  serviceId: "sonarr", router: "sonarr@docker", rule: "", hosts: ["sonarr.test"],
  status: "enabled", tls: true, forwardAuth: true, middlewares: ["authentik@docker"], serverStatus: "up", ...o,
});
const cert = { domains: ["sonarr.test"], notAfter: 1893456000, daysRemaining: 20, issuer: "LE", resolver: "le", keyType: "ECDSA" };

const sonarr = {
  id: "sonarr", name: "Sonarr", cat: "automation", icon: "dns", host: "sonarr.test", scheme: "https",
  embeddable: true, active: true, keepAlive: true, version: "1", status: "up", uptime: 99.9, ms: 12,
  beats: new Array(30).fill(1), note: "", route: route({ cert }),
  authentik: { serviceId: "sonarr", appName: "Sonarr", appSlug: "sonarr", host: "sonarr.test", providerName: null, providerType: null, everyone: true, groups: [], users: 0, policyGated: false },
} as unknown as Service;
const plex = {
  id: "plex", name: "Plex", cat: "stream", icon: "dns", host: "plex.test", scheme: "http",
  embeddable: false, active: true, keepAlive: false, version: "1", status: "up", uptime: 99, ms: 9, beats: [], note: "",
} as unknown as Service;
const unmonitored = { ...plex, id: "radarr", name: "Radarr", status: "unknown", uptime: 0, ms: 0, beats: [] } as unknown as Service;

describe("ServiceCard", () => {
  it("renders the 24h label for a monitored service (Heartbeat strip present)", () => {
    const { container } = render(<ServiceCard s={sonarr} onOpen={vi.fn()} />);
    // The "24h" caption is rendered next to the Heartbeat graph.
    expect(container.textContent).toContain("24h");
  });

  it('renders "not monitored" caption instead of Heartbeat for unknown-status services', () => {
    render(<ServiceCard s={unmonitored} onOpen={vi.fn()} />);
    expect(screen.getByText("not monitored")).toBeInTheDocument();
    // Heartbeat (and its "24h" label) must NOT appear for unmonitored services.
    expect(screen.queryByText("24h")).not.toBeInTheDocument();
  });

  it("renders the EMBED tag for embeddable services", () => {
    render(<ServiceCard s={sonarr} onOpen={vi.fn()} />);
    expect(screen.getByText("EMBED")).toBeInTheDocument();
  });

  it("renders the LAUNCH tag for non-embeddable services", () => {
    render(<ServiceCard s={plex} onOpen={vi.fn()} />);
    expect(screen.getByText("LAUNCH")).toBeInTheDocument();
  });

  it("surfaces the TLS-cert lock tooltip for a secured service", () => {
    render(<ServiceCard s={sonarr} onOpen={vi.fn()} />);
    // embedAuthSummary derives the title from the cert summary.
    expect(screen.getByTitle(/TLS cert for sonarr\.test/)).toBeInTheDocument();
  });

  it("renders the SSO shield_person icon when behind forward-auth", () => {
    render(<ServiceCard s={sonarr} onOpen={vi.fn()} />);
    expect(screen.getAllByText("shield_person").length).toBeGreaterThan(0);
  });

  it("shows the keep-alive glyph as live for a service in keptAliveIds", () => {
    render(<ServiceCard s={sonarr} onOpen={vi.fn()} />);
    expect(screen.getByTitle(/running in the background now/i)).toBeInTheDocument();
  });

  it("renders the note on a single reserved line (height 17px, nowrap, overflow hidden)", () => {
    const withNote = { ...plex, note: "A very long note that should stay on one line" } as unknown as Service;
    render(<ServiceCard s={withNote} onOpen={vi.fn()} />);
    const note = screen.getByText("A very long note that should stay on one line");
    expect(note.style.whiteSpace).toBe("nowrap");
    expect(note.style.overflow).toBe("hidden");
    expect(note.style.height).toBe("17px");
  });

  it("clicking the pin button calls toggleFavorite and stops event propagation", () => {
    const onOpen = vi.fn();
    render(<ServiceCard s={sonarr} onOpen={onOpen} />);
    const pinBtn = screen.getByTitle("Pin to rail");
    fireEvent.click(pinBtn);
    expect(portal.toggleFavorite).toHaveBeenCalledWith("sonarr");
    // The card itself must NOT fire onOpen when the pin button is clicked.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("hovering the pin button changes opacity to 1; leaving restores it", () => {
    render(<ServiceCard s={sonarr} onOpen={vi.fn()} />);
    const pinBtn = screen.getByTitle("Pin to rail");
    fireEvent.mouseEnter(pinBtn);
    expect(pinBtn.style.opacity).toBe("1");
    fireEvent.mouseLeave(pinBtn);
    // Sonarr is not pinned (favorites=[]), so opacity reverts to 0.55.
    expect(pinBtn.style.opacity).toBe("0.55");
  });

  it("calls onOpen when the card body is clicked", () => {
    const onOpen = vi.fn();
    const { container } = render(<ServiceCard s={plex} onOpen={onOpen} />);
    // The outer card div is the clickable area; click it directly.
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
