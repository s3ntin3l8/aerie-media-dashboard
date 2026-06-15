import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

// Status view sort controls, focused on the cert-expiry + SSO options (gated on route data).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/app/(portal)/admin/actions", () => Object.fromEntries(
  ["setPrometheusInstance", "setMetricsSource", "setQueueSource", "setBeszelSystem"].map((n) => [n, vi.fn(async () => [])])));
const portal = { role: "admin", realRole: "admin", user: { id: "u1", name: "Ada", email: "a@x" }, favorites: [], toggleFavorite: vi.fn(), modalOpen: false, setModalOpen: vi.fn(), theme: "dark", oidc: true, keptAliveIds: [] };
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn(), usePatchData: () => vi.fn() }));
vi.mock("@/components/mobile/useIsMobile", () => ({ useIsMobile: () => false }));

import { useData } from "@/components/portal/DataProvider";
import { Status } from "@/components/views/Status";

const mkSvc = (over: Record<string, unknown> = {}) => ({
  id: "svc", name: "Svc", cat: "automation", icon: "dns", host: "svc.test", scheme: "https",
  status: "up", uptime: 99.9, uptime24h: 99.9, ms: 12, beats: new Array(30).fill(1), msHistory: [10, 12],
  active: true, embeddable: false, keepAlive: false, ...over,
});

const route = (over: Record<string, unknown>) => ({
  serviceId: "x", router: "x@docker", hosts: ["x.test"], status: "enabled", tls: true, forwardAuth: false, middlewares: [], ...over,
});

// Aaa: 60d cert + SSO · Bbb: 5d cert, no SSO · Ccc: no route at all.
const aaa = mkSvc({ id: "aaa", name: "Aaa", route: route({ forwardAuth: true, cert: { daysRemaining: 60, notAfter: 0, domains: ["a"] } }) });
const bbb = mkSvc({ id: "bbb", name: "Bbb", route: route({ forwardAuth: false, cert: { daysRemaining: 5, notAfter: 0, domains: ["b"] } }) });
const ccc = mkSvc({ id: "ccc", name: "Ccc" });

const snap = (services: unknown[]) => ({
  services, allServices: services, users: [], groups: [], visibility: [], adminGroup: "admins",
  metrics: null, metricsSource: "prometheus", prometheusConfigured: false, beszelConfigured: false, beszelSystemId: null,
  arrHealth: [], metricsBySource: { prometheus: null, beszel: null },
});

const order = () => screen.getAllByText(/^(Aaa|Bbb|Ccc)$/).map((e) => e.textContent);
const clickSort = (label: string) => {
  const bar = screen.getByText("Sort").parentElement!;
  fireEvent.click(within(bar).getByText(label));
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
});

describe("Status — sort controls", () => {
  it("offers Cert + SSO sorts when route data exists and sorts by them", () => {
    vi.mocked(useData).mockReturnValue(snap([aaa, bbb, ccc]) as never);
    render(<Status />);

    // Default: name A→Z.
    expect(order()).toEqual(["Aaa", "Bbb", "Ccc"]);

    // Cert: soonest expiry first, no-cert service last.
    clickSort("Cert");
    expect(order()).toEqual(["Bbb", "Aaa", "Ccc"]);

    // SSO: protected service first, rest by name.
    clickSort("SSO");
    expect(order()).toEqual(["Aaa", "Bbb", "Ccc"]);
  });

  it("hides the Cert + SSO sorts when no service carries route data", () => {
    vi.mocked(useData).mockReturnValue(snap([ccc, mkSvc({ id: "ddd", name: "Ddd" })]) as never);
    render(<Status />);

    const bar = screen.getByText("Sort").parentElement!;
    expect(within(bar).getByText("Name")).toBeInTheDocument();
    expect(within(bar).queryByText("Cert")).not.toBeInTheDocument();
    expect(within(bar).queryByText("SSO")).not.toBeInTheDocument();
  });
});
