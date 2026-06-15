import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Render the real desktop Launcher grid (LauncherCard) and assert the security + keep-alive
// signals surface in each card footer. useVisibleServices runs for real against the mocked
// providers (admin bypasses the visibility filter).
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/services" }));
// Launcher → panels imports a server action (lib/db via "server-only"); stub it for jsdom.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));

const portal = {
  role: "admin", user: { name: "Ada", email: "a@x" }, oidc: true,
  favorites: [], toggleFavorite: vi.fn(), keptAliveIds: ["sonarr"],
};
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn() }));

import { useData } from "@/components/portal/DataProvider";
import { Launcher } from "@/components/views/Launcher";

const route = (o: Record<string, unknown> = {}) =>
  ({ serviceId: "sonarr", router: "sonarr@docker", rule: "", hosts: ["sonarr.test"], status: "enabled", tls: true, forwardAuth: true, middlewares: ["authentik@docker"], serverStatus: "up", ...o });
const cert = { domains: ["sonarr.test"], notAfter: 1893456000, daysRemaining: 20, issuer: "LE", resolver: "le", keyType: "ECDSA" };

const sonarr = {
  id: "sonarr", name: "Sonarr", cat: "automation", icon: "dns", host: "sonarr.test", scheme: "https",
  embeddable: true, active: true, keepAlive: true, version: "1", status: "up", uptime: 99.9, ms: 12, beats: [], note: "",
  route: route({ cert }), authentik: { serviceId: "sonarr", appName: "Sonarr", appSlug: "sonarr", host: "sonarr.test", providerName: null, providerType: null, everyone: true, groups: [], users: 0, policyGated: false },
};
const plex = { id: "plex", name: "Plex", cat: "stream", icon: "dns", host: "plex.test", scheme: "http", embeddable: false, active: true, keepAlive: false, version: "1", status: "up", uptime: 99, ms: 9, beats: [], note: "" };

beforeEach(() => {
  vi.mocked(useData).mockReturnValue({ services: [sonarr, plex], visibility: [] } as never);
});

describe("Launcher desktop cards", () => {
  it("renders the service names and embed/launch pills", () => {
    render(<Launcher />);
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
    expect(screen.getByText("Plex")).toBeInTheDocument();
    expect(screen.getByText("EMBED")).toBeInTheDocument();
    expect(screen.getByText("LAUNCH")).toBeInTheDocument();
  });

  it("surfaces the TLS-cert lock tooltip and the SSO shield for the secured service", () => {
    render(<Launcher />);
    // Lock tints/tooltips from embedAuthSummary — cert summary appears in the title.
    expect(screen.getByTitle(/TLS cert for sonarr\.test/)).toBeInTheDocument();
    // shield_person icon renders for the forward-auth service.
    expect(screen.getAllByText("shield_person").length).toBeGreaterThan(0);
  });

  it("shows the keep-alive glyph as live for a service in keptAliveIds", () => {
    render(<Launcher />);
    expect(screen.getByTitle(/running in the background now/i)).toBeInTheDocument();
  });
});
