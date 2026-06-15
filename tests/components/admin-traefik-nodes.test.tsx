import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const mobile = vi.hoisted(() => ({ value: false }));
const actions = vi.hoisted(() => ({
  setVisibility: vi.fn(), upsertService: vi.fn(), setServiceSecret: vi.fn(),
  setServiceActive: vi.fn(), setServiceKeepAlive: vi.fn(), deleteService: vi.fn(),
  serviceExists: vi.fn(), detectServiceVersion: vi.fn(), probeServiceVersion: vi.fn(),
  testStoredConnection: vi.fn(), setUserOverseerrQuota: vi.fn(),
  dismissTraefikHost: vi.fn(), restoreTraefikHost: vi.fn(),
}));

vi.mock("@/components/mobile/useIsMobile", () => ({ useIsMobile: () => mobile.value }));
vi.mock("@/app/(portal)/admin/actions", () => actions);
vi.mock("@/app/(portal)/admin/plex-actions", () => ({ getPlexPanelData: vi.fn(async () => ({ configured: false, hasToken: false, sections: [], tasks: [] })), scanSectionAction: vi.fn(), analyzeSectionAction: vi.fn(), emptyTrashAction: vi.fn(), cleanBundlesAction: vi.fn(), optimizeDbAction: vi.fn(), runButlerTaskAction: vi.fn() }));
vi.mock("@/components/portal/DataProvider", () => ({
  useData: vi.fn(), useRefresh: () => vi.fn(), usePatchData: () => vi.fn(),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({
    favorites: [], toggleFavorite: vi.fn(),
    user: { id: "u1", name: "Admin", email: "a@b.c", role: "admin" },
    role: "admin", oidc: false, setModalOpen: vi.fn(), modalOpen: false,
    paletteOpen: false, setPaletteOpen: vi.fn(),
  }),
}));

import { useData } from "@/components/portal/DataProvider";
import { Admin } from "@/components/views/Admin";
import type { TraefikInstance } from "@/lib/types";

const mkSvc = (over: Record<string, unknown> = {}) => ({
  id: "sonarr", name: "Sonarr", cat: "automation", icon: "dns", host: "sonarr.test",
  scheme: "https", embeddable: true, active: true, keepAlive: false, version: "1",
  status: "up", uptime: 99.9, ms: 5, beats: [], note: "", ...over,
});

const seed = (instances: TraefikInstance[]) =>
  vi.mocked(useData).mockReturnValue({
    services: [mkSvc(), mkSvc({ id: "radarr", name: "Radarr", host: "radarr.test" })],
    allServices: [mkSvc(), mkSvc({ id: "radarr", name: "Radarr", host: "radarr.test" })],
    groups: [], visibility: [], adminGroup: "admins", users: [],
    traefikInstances: instances,
  } as never);

const node = (over: Partial<TraefikInstance> = {}): TraefikInstance =>
  ({ name: "node-01", status: "ok", version: "3.1.0", role: "gateway",
     counts: { routers: 12, services: 10, middlewares: 4, warnings: 0 }, serves: ["sonarr"], ...over });

beforeEach(() => {
  mobile.value = false;
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as never;
});
afterEach(() => vi.unstubAllGlobals());

describe("Admin — Traefik nodes panel", () => {
  it("is collapsed by default and expands to show node health + served count", () => {
    seed([node()]);
    render(<Admin />);

    // Header present, but the node detail is hidden until expanded.
    expect(screen.getByText("Traefik nodes")).toBeInTheDocument();
    expect(screen.queryByText("node-01")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Traefik nodes"));
    expect(screen.getByText("node-01")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.getByText("v3.1.0")).toBeInTheDocument();
    // serves one configured service → "1 service"; tooltip lists the resolved service name.
    const serves = screen.getByText("1 service");
    expect(serves.title).toContain("Sonarr");
  });

  it("shows the degraded status and warning count for an unhealthy node", () => {
    seed([node({ name: "node-02", status: "degraded", role: undefined,
      counts: { routers: 3, services: 2, middlewares: 1, warnings: 2 }, serves: ["sonarr", "radarr"] })]);
    render(<Admin />);
    fireEvent.click(screen.getByText("Traefik nodes"));

    expect(screen.getByText("degraded")).toBeInTheDocument();
    expect(screen.getByText("2 services")).toBeInTheDocument();
    expect(screen.getByText(/2⚠/)).toBeInTheDocument();
  });

  it("renders no nodes panel when there are no scoped instances", () => {
    seed([]);
    render(<Admin />);
    expect(screen.queryByText("Traefik nodes")).not.toBeInTheDocument();
  });

  it("renders the nodes panel (and service cards) in the mobile Admin layout", () => {
    mobile.value = true;
    seed([node()]);
    render(<Admin />);
    expect(screen.getByText("Traefik nodes")).toBeInTheDocument();
    // mobile layout renders service cards too
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Traefik nodes"));
    expect(screen.getByText("node-01")).toBeInTheDocument();
  });
});

describe("Admin — key badge for key-optional Traefik sources", () => {
  const seedSvcs = (svcs: Record<string, unknown>[]) =>
    vi.mocked(useData).mockReturnValue({
      services: svcs, allServices: svcs, groups: [], visibility: [], adminGroup: "admins", users: [],
    } as never);

  it("shows the neutral 'No key' badge for a Traefik source recognized only by id/name (not a preset key)", () => {
    // id/name match /traefik/i but normalize to no preset, and no logoSlug → strict matchPreset
    // would flag it as needing a key; isTraefikSource keeps it key-optional → neutral "No key".
    seedSvcs([mkSvc({ id: "traefik-viewer", name: "Traefik Viewer", host: "traefik.test", hasSecret: false })]);
    render(<Admin />);
    // Desktop table renders the compact (icon-only) key indicator; the state is in the tooltip.
    expect(screen.getByTitle("No API key needed for this service")).toBeInTheDocument();
    expect(screen.queryByTitle("No API key set — this service expects one")).not.toBeInTheDocument();
  });

  it("still warns ('Not set') for a non-Traefik service missing a required key", () => {
    seedSvcs([mkSvc({ id: "sonarr", name: "Sonarr", host: "sonarr.test", hasSecret: false })]);
    render(<Admin />);
    expect(screen.getByTitle("No API key set — this service expects one")).toBeInTheDocument();
  });
});

describe("Admin — discovered Traefik dismiss / restore", () => {
  const discovered = (over: Record<string, unknown> = {}) => ({
    serviceId: "", router: "grafana@docker", rule: "Host(`grafana.lan`)", hosts: ["grafana.lan"],
    status: "enabled", tls: true, forwardAuth: false, middlewares: [], serverStatus: "up", ...over,
  });
  const seedDiscovered = (extra: Record<string, unknown>) =>
    vi.mocked(useData).mockReturnValue({
      services: [mkSvc()], allServices: [mkSvc()], groups: [], visibility: [], adminGroup: "admins", users: [],
      traefikConfigured: true, ...extra,
    } as never);

  it("dismisses a discovered host, persisting via the action", () => {
    seedDiscovered({ traefikDiscovered: [discovered()], traefikDismissed: [] });
    render(<Admin />);
    fireEvent.click(screen.getByText("Discovered via Traefik")); // expand
    fireEvent.click(screen.getByTitle(/Dismiss grafana.lan/));
    expect(actions.dismissTraefikHost).toHaveBeenCalledWith("grafana.lan");
  });

  it("restores a previously dismissed host from the disclosure", () => {
    seedDiscovered({ traefikDiscovered: [], traefikDismissed: ["grafana.lan"] });
    render(<Admin />);
    fireEvent.click(screen.getByText("Discovered via Traefik")); // expand
    fireEvent.click(screen.getByText("1 dismissed")); // open the <details>
    fireEvent.click(screen.getByTitle(/Restore grafana.lan/));
    expect(actions.restoreTraefikHost).toHaveBeenCalledWith("grafana.lan");
  });

  it("attributes a discovered host to its source instance when >1 Traefik is configured", () => {
    const t1 = mkSvc({ id: "traefik-a", name: "Traefik A", logoSlug: "traefik" });
    const t2 = mkSvc({ id: "traefik-b", name: "Traefik B", logoSlug: "traefik" });
    vi.mocked(useData).mockReturnValue({
      services: [t1, t2], allServices: [t1, t2], groups: [], visibility: [], adminGroup: "admins", users: [],
      traefikConfigured: true, traefikDiscovered: [discovered({ via: "traefik-b" })], traefikDismissed: [],
    } as never);
    render(<Admin />);
    fireEvent.click(screen.getByText("Discovered via Traefik"));
    expect(screen.getByText("via Traefik B")).toBeInTheDocument();
  });
});
