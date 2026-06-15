import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    setModalOpen: vi.fn(),
    modalOpen: false,
    paletteOpen: false,
    setPaletteOpen: vi.fn(),
    keptAliveIds: [],
  }),
}));

import { useData } from "@/components/portal/DataProvider";
import { Admin } from "@/components/views/Admin";

const mkSvc = (over: Record<string, unknown> = {}) => ({
  id: "svc",
  name: "Svc",
  cat: "automation",
  icon: "dns",
  host: "svc.test",
  scheme: "https",
  embeddable: true,
  active: true,
  keepAlive: false,
  hasSecret: false,
  version: "1",
  status: "up",
  uptime: 99.9,
  ms: 5,
  beats: [],
  note: "",
  ...over,
});

// Three services that differ along every newly-sortable axis. Category labels sort
// alphabetically: Automation < Infra < Monitoring.
const alpha = mkSvc({ id: "alpha", name: "Alpha", cat: "monitor", active: true, keepAlive: true, hasSecret: true });
const bravo = mkSvc({ id: "bravo", name: "Bravo", cat: "automation", active: false, keepAlive: false, hasSecret: false });
const charlie = mkSvc({ id: "charlie", name: "Charlie", cat: "infra", active: true, keepAlive: false, hasSecret: true, embeddable: false });

const seedData = (services: unknown[]) =>
  vi.mocked(useData).mockReturnValue({
    services,
    allServices: services,
    groups: [],
    visibility: [],
    adminGroup: "admins",
    users: [],
  } as never);

// Names render once per row/card, so getAllByText returns them in document order.
const order = () => screen.getAllByText(/^(Alpha|Bravo|Charlie)$/).map((e) => e.textContent);
const clickHeader = (label: string) => fireEvent.click(screen.getByText(label).closest("button")!);

beforeEach(() => {
  mobile.value = false;
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as never;
});
afterEach(() => vi.unstubAllGlobals());

describe("Admin — desktop column sorting", () => {
  beforeEach(() => seedData([alpha, bravo, charlie]));

  it("defaults to name A→Z", () => {
    render(<Admin />);
    expect(order()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by Category label, toggling asc/desc on repeat clicks", () => {
    render(<Admin />);
    clickHeader("Category"); // asc: Automation, Infra, Monitoring
    expect(order()).toEqual(["Bravo", "Charlie", "Alpha"]);
    clickHeader("Category"); // desc
    expect(order()).toEqual(["Alpha", "Charlie", "Bravo"]);
  });

  it("sorts the boolean columns (Active / Keep / API key) true-first on first click", () => {
    render(<Admin />);
    // Active: Alpha + Charlie active, Bravo not.
    clickHeader("Active");
    expect(order()).toEqual(["Alpha", "Charlie", "Bravo"]);
    // Keep: only Alpha kept alive.
    clickHeader("Keep");
    expect(order()[0]).toBe("Alpha");
    // API key: Alpha + Charlie have a stored secret, Bravo does not.
    clickHeader("API key");
    expect(order()).toEqual(["Alpha", "Charlie", "Bravo"]);
  });
});

describe("Admin — mobile sort select", () => {
  it("exposes and applies the new Category sort option", () => {
    mobile.value = true;
    seedData([alpha, bravo, charlie]);
    render(<Admin />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cat:asc" } });
    expect(order()).toEqual(["Bravo", "Charlie", "Alpha"]);
  });
});
