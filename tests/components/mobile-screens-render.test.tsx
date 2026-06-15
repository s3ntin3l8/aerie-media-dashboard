import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// Smoke: render every mobile screen with a realistic snapshot so their composition runs
// (the real useVisibleServices / useRequestReview / useStreamProgress hooks run against the
// mocked providers). Catches mobile render/prop regressions.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/app/(portal)/requests/actions", () => Object.fromEntries(
  ["submitRequest", "getQualityProfiles", "deleteRequest", "editRequest", "getMediaDetail", "getSeasonQuality", "resolveDiscoverItem", "getWatchlist"].map((n) => [n, vi.fn(async () => [])])));
vi.mock("@/app/(portal)/admin/actions", () => Object.fromEntries(
  ["setVisibility", "setUserOverseerrQuota", "setServiceSecret", "upsertService", "setServiceActive",
    "setServiceKeepAlive", "serviceExists", "deleteService", "detectServiceVersion", "probeServiceVersion",
    "testStoredConnection", "setPrometheusInstance", "setMetricsSource", "setQueueSource", "setBeszelSystem"].map((n) => [n, vi.fn(async () => [])])));
vi.mock("@/app/(portal)/actions", () => ({ signOutAction: vi.fn(), setFavoritesAction: vi.fn(), setDashboardsAction: vi.fn() }));

const portal = {
  role: "admin", realRole: "admin", user: { id: "u1", name: "Ada", email: "a@x" }, favorites: [], toggleFavorite: vi.fn(),
  modalOpen: false, setModalOpen: vi.fn(), theme: "dark", toggleTheme: vi.fn(), setPaletteOpen: vi.fn(), signOut: vi.fn(), oidc: true,
  keptAliveIds: ["media"], initialDashboards: null,
};
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn(), usePatchData: () => vi.fn() }));

import { useData } from "@/components/portal/DataProvider";
import { MobileDashboard } from "@/components/mobile/screens/MobileDashboard";
import { MobileStatus } from "@/components/mobile/screens/MobileStatus";
import { MobileStreams } from "@/components/mobile/screens/MobileStreams";
import { MobileRequests } from "@/components/mobile/screens/MobileRequests";
import { MobileServices } from "@/components/mobile/screens/MobileServices";
import { MobileAdmin } from "@/components/mobile/screens/MobileAdmin";

const service = { id: "sonarr", name: "Sonarr", cat: "automation", icon: "dns", host: "sonarr.test", scheme: "https", status: "up", uptime: 99.9, ms: 12, beats: new Array(30).fill(1), active: true, embeddable: false, keepAlive: false };
// A second, fully-secured + keep-alive service so the mobile screens exercise the lock / shield /
// keep-alive / cert / SSO branches added for #50/#71 (kept "live" via portal.keptAliveIds above).
const mediaSvc = {
  id: "media", name: "Media", cat: "stream", icon: "dns", host: "media.test", scheme: "https",
  status: "up", uptime: 99.5, ms: 8, beats: new Array(30).fill(1), active: true, embeddable: true, keepAlive: true,
  route: { serviceId: "media", router: "media@docker", rule: "", hosts: ["media.test"], status: "enabled", tls: true, forwardAuth: true, middlewares: ["authentik@docker"], serverStatus: "up", cert: { domains: ["media.test"], notAfter: 1893456000, daysRemaining: 30, issuer: "LE", resolver: "le", keyType: "ECDSA" } },
  authentik: { serviceId: "media", appName: "Media", appSlug: "media", host: "media.test", providerName: null, providerType: null, everyone: true, groups: [], users: 0, policyGated: false },
};
const SNAP = {
  services: [service, mediaSvc], allServices: [service, mediaSvc], users: [{ id: "u1", name: "Ada", email: "a@x", role: "admin", avatar: undefined }],
  visibility: [], groups: [{ name: "admins", label: "Admins" }], adminGroup: "admins",
  nowPlaying: [], library: [{ id: "movies", label: "Movies", count: "100", icon: "movie", delta: "" }], libraryAll: [], recent: [], recentAll: [],
  requests: [], requestCounts: { total: 0, pending: 0, approved: 0, processing: 0, failed: 0, available: 0 }, issues: null,
  bandwidth: { totalMbps: 0, wanMbps: 0 }, plays24h: [1, 2, 3], metrics: null, metricsSource: "prometheus",
  arrHealth: [], upcoming: [], downloads: [], queue: [], storage: [],
};

beforeEach(() => {
  vi.mocked(useData).mockReturnValue(SNAP as never);
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
});

describe("mobile screen smoke renders", () => {
  it("MobileDashboard renders", () => { expect(render(<MobileDashboard />).container.textContent).toBeTruthy(); });
  it("MobileStatus renders", () => { expect(render(<MobileStatus />).container.textContent).toBeTruthy(); });
  it("MobileStreams renders", () => { expect(render(<MobileStreams />).container.textContent).toBeTruthy(); });
  it("MobileRequests renders", () => { expect(render(<MobileRequests />).container.textContent).toBeTruthy(); });
  it("MobileServices renders", () => { expect(render(<MobileServices onOpen={vi.fn()} />).container.textContent).toBeTruthy(); });
  it("MobileAdmin renders", () => { expect(render(<MobileAdmin onClose={vi.fn()} />).container.textContent).toBeTruthy(); });
});
