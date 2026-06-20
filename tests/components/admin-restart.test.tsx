import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// AdminServices container-restart action (issue #41): per-row restart button gated on
// `canRestart`, a confirm modal, and toast feedback.
const actions = vi.hoisted(() => ({
  setServiceActive: vi.fn(),
  setServiceKeepAlive: vi.fn(),
  dismissTraefikHost: vi.fn(),
  restoreTraefikHost: vi.fn(),
  restartServiceContainer: vi.fn(async () => undefined),
}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/app/(portal)/admin/actions", () => actions);
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => refresh, usePatchData: () => vi.fn() }));
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => ({ favorites: [], toggleFavorite: vi.fn(), keptAliveIds: [], modalOpen: false, setModalOpen: vi.fn() }) }));

import { useData } from "@/components/portal/DataProvider";
import { restartServiceContainer } from "@/app/(portal)/admin/actions";
import { AdminServices } from "@/components/views/admin/AdminServices";

const mkSvc = (over: Record<string, unknown> = {}) => ({
  id: "tautulli", name: "Tautulli", cat: "monitor", icon: "dns", host: "t.test", scheme: "https",
  status: "up", uptime: 99, ms: 5, beats: [], active: true, embeddable: true, keepAlive: false, hasSecret: true, ...over,
});
const data = (services: unknown[]) => ({ allServices: services, services, traefikDiscovered: [], traefikDismissed: [], traefikInstances: [], lokiConfigured: false });
const props = { isMobile: false, onOpenService: vi.fn(), onEdit: vi.fn(), onAddDiscovered: vi.fn() };

beforeEach(() => vi.clearAllMocks());

describe("AdminServices — container restart", () => {
  it("renders an Actions header and a restart button only for restartable rows", () => {
    vi.mocked(useData).mockReturnValue(data([
      mkSvc({ id: "tautulli", name: "Tautulli", canRestart: true, containerName: "tautulli" }),
      mkSvc({ id: "plex", name: "Plex", canRestart: false }),
    ]) as never);
    render(<AdminServices {...props} />);
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getAllByTitle("Restart container")).toHaveLength(1);
  });

  it("opens a confirm modal and calls the action + refresh on confirm", async () => {
    vi.mocked(useData).mockReturnValue(data([mkSvc({ canRestart: true, containerName: "tautulli", portainerEndpointId: "3" })]) as never);
    render(<AdminServices {...props} />);

    fireEvent.click(screen.getByTitle("Restart container"));
    expect(screen.getByText("Restart Tautulli?")).toBeTruthy();
    expect(restartServiceContainer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Restart$/ }));
    await waitFor(() => expect(restartServiceContainer).toHaveBeenCalledWith("tautulli"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("cancel closes the modal without calling the action", () => {
    vi.mocked(useData).mockReturnValue(data([mkSvc({ canRestart: true, containerName: "tautulli" })]) as never);
    render(<AdminServices {...props} />);
    fireEvent.click(screen.getByTitle("Restart container"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(restartServiceContainer).not.toHaveBeenCalled();
    expect(screen.queryByText("Restart Tautulli?")).toBeNull();
  });

  it("Escape closes the confirm modal without calling the action", () => {
    vi.mocked(useData).mockReturnValue(data([mkSvc({ canRestart: true, containerName: "tautulli" })]) as never);
    render(<AdminServices {...props} />);
    fireEvent.click(screen.getByTitle("Restart container"));
    expect(screen.getByText("Restart Tautulli?")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Restart Tautulli?")).toBeNull();
    expect(restartServiceContainer).not.toHaveBeenCalled();
  });

  it("renders the restart action in the mobile card layout and opens the modal", () => {
    vi.mocked(useData).mockReturnValue(data([mkSvc({ canRestart: true, containerName: "tautulli" })]) as never);
    render(<AdminServices {...props} isMobile />);
    fireEvent.click(screen.getByTitle("Restart container"));
    expect(screen.getByText("Restart Tautulli?")).toBeTruthy();
  });

  it("surfaces an error toast when the restart fails", async () => {
    vi.mocked(useData).mockReturnValue(data([mkSvc({ canRestart: true, containerName: "tautulli" })]) as never);
    vi.mocked(restartServiceContainer).mockRejectedValueOnce(new Error("Portainer is not configured"));
    render(<AdminServices {...props} />);
    fireEvent.click(screen.getByTitle("Restart container"));
    fireEvent.click(screen.getByRole("button", { name: /Restart$/ }));
    await waitFor(() => expect(screen.getByText("Portainer is not configured")).toBeTruthy());
  });
});
