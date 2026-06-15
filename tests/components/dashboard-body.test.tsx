import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// DashboardBody is pure wiring: it hands a DashboardApi to the GridDashboard and the four
// dashboard modals. We stub the grid + modals so each test asserts the *contract* — which api
// method fires for which modal callback, and that RequestModal.onSubmit threads through
// submitRequest + a data refresh, and UpcomingDetailModal.onOpenService builds the route.

const push = vi.fn();
const refresh = vi.fn();
const submitRequest = vi.fn(async (..._a: unknown[]) => ({ ok: true }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/portal/DataProvider", () => ({ useRefresh: () => refresh }));
vi.mock("@/components/hooks/useRequestReview", () => ({ useRequestReview: () => ({ onAct: vi.fn() }) }));
vi.mock("@/app/(portal)/requests/actions", () => ({ submitRequest: (...a: unknown[]) => submitRequest(...a) }));

vi.mock("@/components/portal/GridDashboard", () => ({
  GridDashboard: (p: { forceStacked?: boolean }) => <div data-testid="grid" data-force={String(!!p.forceStacked)} />,
}));
vi.mock("@/components/modals/AddWidgetModal", () => ({
  AddWidgetModal: ({ open, onClose, onAdd, role, layout }: { open: boolean; onClose: () => void; onAdd: (t: string) => void; role: string; layout: unknown[] }) =>
    open ? (
      <div data-testid="add">
        <span data-testid="add-role">{role}</span>
        <span data-testid="add-count">{layout.length}</span>
        <button onClick={() => onAdd("clock")}>add-widget</button>
        <button onClick={onClose}>close-add</button>
      </div>
    ) : null,
}));
vi.mock("@/components/modals/CardSettingsModal", () => ({
  CardSettingsModal: ({ open, tile, onClose, onSave }: { open: boolean; tile?: { uid: string }; onClose: () => void; onSave: (uid: string, s: Record<string, unknown>) => void }) =>
    open ? (
      <div data-testid="cfg">
        <span data-testid="cfg-tile">{tile?.uid ?? "none"}</span>
        <button onClick={() => onSave("s-0", { limit: 5 })}>save-cfg</button>
        <button onClick={onClose}>close-cfg</button>
      </div>
    ) : null,
}));
vi.mock("@/components/modals/RequestModal", () => ({
  RequestModal: ({ open, onSubmit, onClose }: { open: boolean; onSubmit: (p: unknown, q: string, s: Record<number, boolean>) => Promise<unknown>; onClose: () => void }) =>
    open ? (
      <div data-testid="req">
        <button onClick={() => onSubmit({ id: 7 }, "hd", { 1: true, 2: false, 3: true })}>submit-req</button>
        <button onClick={onClose}>close-req</button>
      </div>
    ) : null,
}));
vi.mock("@/components/modals/UpcomingDetailModal", () => ({
  UpcomingDetailModal: ({ onClose, onOpenService }: { onClose: () => void; onOpenService: (svc: string, at?: string) => void }) => (
    <div data-testid="up">
      <button onClick={() => onOpenService("plex", "abc def")}>open-at</button>
      <button onClick={() => onOpenService("plex")}>open-noat</button>
      <button onClick={onClose}>close-up</button>
    </div>
  ),
}));

import { DashboardBody } from "@/components/portal/DashboardBody";
import type { DashboardApi } from "@/components/portal/useDashboard";

function makeApi(over: Partial<DashboardApi> = {}): DashboardApi {
  return {
    role: "admin",
    layout: [{ uid: "s-0", type: "status", x: 0, y: 0, w: 4, h: 4 }],
    overlay: undefined,
    setLayout: vi.fn(),
    removeWidget: vi.fn(),
    addWidget: vi.fn(),
    resetLayout: vi.fn(),
    updateSettings: vi.fn(),
    mobileReorder: vi.fn(),
    mobileHide: vi.fn(),
    mobileShow: vi.fn(),
    renderWidget: vi.fn(() => null),
    openService: vi.fn(),
    editing: false,
    toggleEdit: vi.fn(),
    addOpen: false,
    setAddOpen: vi.fn(),
    configUid: null,
    setConfigUid: vi.fn(),
    reqPick: null,
    setReqPick: vi.fn(),
    upcomingPick: null,
    setUpcomingPick: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  submitRequest.mockClear();
});

describe("DashboardBody", () => {
  it("passes forceStacked through to the grid", () => {
    render(<DashboardBody api={makeApi()} forceStacked />);
    expect(screen.getByTestId("grid")).toHaveAttribute("data-force", "true");
  });

  it("defaults forceStacked off (desktop)", () => {
    render(<DashboardBody api={makeApi()} />);
    expect(screen.getByTestId("grid")).toHaveAttribute("data-force", "false");
  });

  it("wires the Add-widget modal (role/layout in, onAdd + onClose out)", () => {
    const api = makeApi({ addOpen: true });
    render(<DashboardBody api={api} />);
    expect(screen.getByTestId("add-role")).toHaveTextContent("admin");
    expect(screen.getByTestId("add-count")).toHaveTextContent("1");
    fireEvent.click(screen.getByText("add-widget"));
    expect(api.addWidget).toHaveBeenCalledWith("clock");
    fireEvent.click(screen.getByText("close-add"));
    expect(api.setAddOpen).toHaveBeenCalledWith(false);
  });

  it("wires Card settings: onSave applies settings then closes", () => {
    const api = makeApi({ configUid: "s-0" });
    render(<DashboardBody api={api} />);
    expect(screen.getByTestId("cfg-tile")).toHaveTextContent("s-0");
    fireEvent.click(screen.getByText("save-cfg"));
    expect(api.updateSettings).toHaveBeenCalledWith("s-0", { limit: 5 });
    expect(api.setConfigUid).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByText("close-cfg"));
    expect(api.setConfigUid).toHaveBeenCalledWith(null);
  });

  it("submits a request: maps selected seasons, calls submitRequest then refresh", async () => {
    const api = makeApi({ reqPick: { id: 7 } as never });
    render(<DashboardBody api={api} />);
    fireEvent.click(screen.getByText("submit-req"));
    // seasons {1:true,2:false,3:true} → picked [1,3]; quality "hd".
    await vi.waitFor(() => expect(submitRequest).toHaveBeenCalledWith({ id: 7 }, [1, 3], "hd"));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    fireEvent.click(screen.getByText("close-req"));
    expect(api.setReqPick).toHaveBeenCalledWith(null);
  });

  it("opens a service from the upcoming modal, with and without a timestamp", () => {
    const api = makeApi({ upcomingPick: { id: "u1" } as never });
    render(<DashboardBody api={api} />);
    fireEvent.click(screen.getByText("open-at"));
    expect(push).toHaveBeenCalledWith("/s/plex?at=abc%20def");
    expect(api.setUpcomingPick).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByText("open-noat"));
    expect(push).toHaveBeenCalledWith("/s/plex");
    fireEvent.click(screen.getByText("close-up"));
    expect(api.setUpcomingPick).toHaveBeenCalledWith(null);
  });
});
