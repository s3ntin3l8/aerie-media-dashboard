import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Hoisted holders the vi.mock factories can read.
const mobile = vi.hoisted(() => ({ value: false }));
const actions = vi.hoisted(() => ({
  setVisibility: vi.fn(),
  upsertService: vi.fn(),
  setServiceSecret: vi.fn(),
  setServiceActive: vi.fn(),
  setServiceKeepAlive: vi.fn(),
  deleteService: vi.fn(),
  serviceExists: vi.fn(),
  detectServiceVersion: vi.fn(),
  probeServiceVersion: vi.fn(),
  testStoredConnection: vi.fn(),
  setUserOverseerrQuota: vi.fn(),
}));

vi.mock("@/components/mobile/useIsMobile", () => ({ useIsMobile: () => mobile.value }));
vi.mock("@/app/(portal)/admin/actions", () => actions);
vi.mock("@/app/(portal)/admin/plex-actions", () => ({ getPlexPanelData: vi.fn(async () => ({ configured: false, hasToken: false, sections: [], tasks: [] })), scanSectionAction: vi.fn(), analyzeSectionAction: vi.fn(), emptyTrashAction: vi.fn(), cleanBundlesAction: vi.fn(), optimizeDbAction: vi.fn(), runButlerTaskAction: vi.fn() }));
vi.mock("@/components/portal/DataProvider", () => ({
  useData: vi.fn(),
  useRefresh: () => vi.fn(),
  usePatchData: () => vi.fn(),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({
    favorites: [],
    toggleFavorite: vi.fn(),
    user: { id: "u1", name: "Admin", email: "a@b.c", role: "admin" },
    role: "admin",
    oidc: false,
    // ModalShell reads setModalOpen; provide the rest of the context surface defensively.
    setModalOpen: vi.fn(),
    modalOpen: false,
    paletteOpen: false,
    setPaletteOpen: vi.fn(),
    keptAliveIds: [],
  }),
}));

import { useData } from "@/components/portal/DataProvider";
import { Admin } from "@/components/views/Admin";
import { ServiceModal } from "@/components/modals/ServiceModal";

const mkSvc = (over: Record<string, unknown> = {}) => ({
  id: "sonarr",
  name: "Sonarr",
  cat: "automation",
  icon: "dns",
  host: "sonarr.test",
  scheme: "https",
  embeddable: true,
  active: true,
  keepAlive: false,
  version: "1",
  status: "up",
  uptime: 99.9,
  ms: 5,
  beats: [],
  note: "",
  ...over,
});

const plex = mkSvc({ id: "plex", name: "Plex", embeddable: false });

const seedData = (services: unknown[]) =>
  vi.mocked(useData).mockReturnValue({
    services,
    allServices: services,
    groups: [],
    visibility: [],
    adminGroup: "admins",
    users: [],
  } as never);

beforeEach(() => {
  mobile.value = false;
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as never;
});
afterEach(() => vi.unstubAllGlobals());

describe("Admin — keep-alive toggle", () => {
  it("toggles keep-alive from the desktop services table", async () => {
    seedData([mkSvc(), plex]);
    render(<Admin />);

    const cell = screen.getByTitle(/Keep this service's iframe mounted/);
    fireEvent.click(within(cell).getByRole("button"));

    await waitFor(() =>
      expect(actions.setServiceKeepAlive).toHaveBeenCalledWith("sonarr", true),
    );
  });

  it("renders the consolidated proxy/access column and the compact stored-key indicator", () => {
    const cert = { domains: ["sonarr.test"], notAfter: 1893456000, daysRemaining: 20, issuer: "LE", resolver: "le", keyType: "ECDSA" };
    seedData([mkSvc({
      hasSecret: true,
      route: { serviceId: "sonarr", router: "sonarr@docker", rule: "", hosts: ["sonarr.test"], status: "enabled", tls: true, forwardAuth: true, middlewares: ["authentik@docker"], serverStatus: "up", cert },
      authentik: { serviceId: "sonarr", appName: "Sonarr", appSlug: "sonarr", host: "sonarr.test", providerName: null, providerType: null, everyone: true, groups: [], users: 0, policyGated: false },
    })]);
    render(<Admin />);

    // Proxy & access column: SSO chip + cert expiry + Authentik access, all in one cell.
    expect(screen.getByText("SSO")).toBeInTheDocument();
    expect(screen.getByText(/cert 20d/)).toBeInTheDocument();
    expect(screen.getByText("everyone")).toBeInTheDocument();
    // API-key column is icon-only on desktop; the AES-GCM state lives in the tooltip.
    expect(screen.getByTitle("API key stored (AES-GCM encrypted)")).toBeInTheDocument();
  });

  it("renders the keep-alive toggle in the mobile card", () => {
    mobile.value = true;
    // keepAlive:true so the mobile card's corner keep-alive glyph branch renders too;
    // hasSecret:true so the (non-compact) stored-key indicator renders in the mobile card.
    seedData([mkSvc({ keepAlive: true, hasSecret: true }), plex]);
    render(<Admin />);

    // Embeddable service: enabled toggle; non-embeddable: disabled with explanatory title.
    expect(screen.getByTitle(/Keep the iframe mounted/)).toBeInTheDocument();
    expect(screen.getByTitle(/Only embeddable services can be kept alive/)).toBeInTheDocument();
  });
});

describe("ServiceModal — keep-alive field", () => {
  const modalProps = {
    open: true as const,
    groups: [{ name: "admins" }, { name: "members" }],
    adminGroup: "admins",
    initialVisibility: {},
    onClose: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onDetectVersion: vi.fn(),
    onTestConnection: vi.fn(),
    onSaveAndTest: vi.fn(),
    onTestSaved: vi.fn(),
  };

  it("shows the keep-alive ToggleRow for an embeddable service and toggles it (add mode)", () => {
    render(<ServiceModal {...modalProps} mode="add" />);
    const title = screen.getByText("Keep session alive");
    expect(title).toBeInTheDocument();
    // title <div> → text wrapper → ToggleRow; click its Toggle button to exercise onChange.
    const row = title.parentElement!.parentElement!;
    fireEvent.click(within(row).getByRole("button"));
  });

  it("seeds keep-alive from the service in edit mode", () => {
    render(<ServiceModal {...modalProps} mode="edit" service={mkSvc({ keepAlive: true }) as never} />);
    expect(screen.getByText("Keep session alive")).toBeInTheDocument();
  });

  it("seeds the add form from a prefill (discovered Traefik router)", () => {
    render(<ServiceModal {...modalProps} mode="add" prefill={{ name: "grafana", host: "grafana.lan", scheme: "https", cat: "infra", icon: "monitoring" }} />);
    expect(screen.getByDisplayValue("grafana")).toBeInTheDocument();
    expect(screen.getByDisplayValue("grafana.lan")).toBeInTheDocument();
  });
});

describe("Admin — discovered Traefik routers", () => {
  it("lists discovered routers and opens the add modal pre-filled on Add", () => {
    vi.mocked(useData).mockReturnValue({
      services: [mkSvc()], allServices: [mkSvc()], groups: [], visibility: [], adminGroup: "admins", users: [],
      traefikConfigured: true,
      traefikDiscovered: [{ serviceId: "", router: "grafana@docker", rule: "Host(`grafana.lan`)", hosts: ["grafana.lan"], status: "enabled", tls: true, forwardAuth: true, middlewares: ["authentik@docker"], serverStatus: "up" }],
    } as never);
    render(<Admin />);

    // The discovery card is collapsed by default — expand it via the header toggle.
    expect(screen.getByText("Discovered via Traefik")).toBeInTheDocument();
    expect(screen.queryByText("grafana.lan")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Discovered via Traefik"));
    expect(screen.getByText("grafana.lan")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Add grafana.lan as a service"));
    // modal opened pre-filled with the discovered host
    expect(screen.getByDisplayValue("grafana.lan")).toBeInTheDocument();
  });
});
