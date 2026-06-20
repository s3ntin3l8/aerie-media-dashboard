import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Status view admin-only container-restart control (issue #41, Portainer route).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/" }));
// jsdom can't resolve the transitive server-only imports behind the actions module — mock it.
vi.mock("@/app/(portal)/admin/actions", () => ({
  setPrometheusInstance: vi.fn(async () => []),
  setMetricsSource: vi.fn(async () => []),
  setQueueSource: vi.fn(async () => []),
  setBeszelSystem: vi.fn(async () => []),
  restartServiceContainer: vi.fn(async () => undefined),
}));

const portal: { role: "admin" | "user" } & Record<string, unknown> = {
  role: "admin", realRole: "admin", user: { id: "u1", name: "Ada", email: "a@x" }, favorites: [], toggleFavorite: vi.fn(),
  modalOpen: false, setModalOpen: vi.fn(), theme: "dark", oidc: true, keptAliveIds: [],
};
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));
const refresh = vi.fn();
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => refresh, usePatchData: () => vi.fn() }));
vi.mock("@/components/mobile/useIsMobile", () => ({ useIsMobile: () => false }));

import { useData } from "@/components/portal/DataProvider";
import { restartServiceContainer } from "@/app/(portal)/admin/actions";
import { Status } from "@/components/views/Status";

const mkSvc = (over: Record<string, unknown> = {}) => ({
  id: "jellyfin", name: "Jellyfin", cat: "stream", icon: "dns", host: "jf.test", scheme: "https",
  status: "up", uptime: 99.9, uptime24h: 99.9, ms: 12, beats: new Array(30).fill(1), msHistory: [10, 12],
  active: true, embeddable: false, keepAlive: false, ...over,
});

const snap = (services: unknown[], visible = true) => ({
  services, allServices: services, users: [], groups: [],
  visibility: visible ? [{ serviceId: "jellyfin", groupName: "friends", visible: true }] : [],
  adminGroup: "admins", metrics: null, metricsSource: "prometheus", prometheusConfigured: false,
  beszelConfigured: false, beszelSystemId: null, arrHealth: [], metricsBySource: { prometheus: null, beszel: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  portal.role = "admin";
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
});

describe("Status — container restart", () => {
  it("shows the restart control for an admin when the service is restartable", () => {
    vi.mocked(useData).mockReturnValue(snap([mkSvc({ canRestart: true })]) as never);
    render(<Status />);
    expect(screen.getByTitle("Restart container")).toBeTruthy();
  });

  it("hides the control when the service is not restartable", () => {
    vi.mocked(useData).mockReturnValue(snap([mkSvc({ canRestart: false })]) as never);
    render(<Status />);
    expect(screen.queryByTitle("Restart container")).toBeNull();
  });

  it("hides the control entirely from non-admin members", () => {
    portal.role = "user";
    vi.mocked(useData).mockReturnValue(snap([mkSvc({ canRestart: true })]) as never);
    render(<Status />);
    expect(screen.queryByTitle("Restart container")).toBeNull();
  });

  it("requires a two-click confirm before calling the restart action, then refreshes", async () => {
    vi.mocked(useData).mockReturnValue(snap([mkSvc({ canRestart: true })]) as never);
    render(<Status />);

    // First click only arms — the action must not fire yet.
    fireEvent.click(screen.getByTitle("Restart container"));
    expect(restartServiceContainer).not.toHaveBeenCalled();

    // Confirm fires the server action and pulls a fresh snapshot.
    fireEvent.click(screen.getByTitle("Restart Jellyfin container"));
    await waitFor(() => expect(restartServiceContainer).toHaveBeenCalledWith("jellyfin"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("surfaces an error toast when the restart action fails", async () => {
    vi.mocked(useData).mockReturnValue(snap([mkSvc({ canRestart: true })]) as never);
    vi.mocked(restartServiceContainer).mockRejectedValueOnce(new Error("Portainer is not configured"));
    render(<Status />);

    fireEvent.click(screen.getByTitle("Restart container"));
    fireEvent.click(screen.getByTitle("Restart Jellyfin container"));
    await waitFor(() => expect(screen.getByText("Portainer is not configured")).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cancel disarms without calling the action", () => {
    vi.mocked(useData).mockReturnValue(snap([mkSvc({ canRestart: true })]) as never);
    render(<Status />);
    fireEvent.click(screen.getByTitle("Restart container"));
    fireEvent.click(screen.getByTitle("Cancel"));
    expect(restartServiceContainer).not.toHaveBeenCalled();
    // Back to the idle icon.
    expect(screen.getByTitle("Restart container")).toBeTruthy();
  });
});
