import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// useDashboard owns the per-role layouts + mobile overlay and persists the whole store on every
// edit. We exercise it against the REAL widgetCatalog/gridLayout (so default seeding + layout math
// are genuine) with only the side-effecting deps mocked. The admin/actions + navigation + provider
// mocks mirror widget-catalog-render.test.tsx, which imports the same panel graph.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => ({ role: "admin" }) }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(() => ({})), useRefresh: () => vi.fn() }));
vi.mock("@/components/hooks/useRequestReview", () => ({ useRequestReview: () => ({ onAct: vi.fn() }) }));
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
const setDashboardsAction = vi.fn();
vi.mock("@/app/(portal)/actions", () => ({ setDashboardsAction: (...a: unknown[]) => setDashboardsAction(...a) }));
vi.mock("@/app/(portal)/requests/actions", () => ({ resolveDiscoverItem: vi.fn(async () => null) }));

import { useDashboard } from "@/components/portal/useDashboard";

beforeEach(() => { setDashboardsAction.mockClear(); push.mockClear(); });

describe("useDashboard", () => {
  it("seeds the admin default layout when no store is provided", () => {
    const { result } = renderHook(() => useDashboard(null));
    expect(result.current.role).toBe("admin");
    expect(result.current.layout.length).toBeGreaterThan(0);
    // The default admin layout includes the central services widget.
    expect(result.current.layout.some((t) => t.type === "centralServices")).toBe(true);
  });

  it("seeds from a provided store instead of the default", () => {
    const store = { admin: [{ uid: "status-0", type: "status", x: 0, y: 0, w: 4, h: 4 }], user: [], mobile: {} };
    const { result } = renderHook(() => useDashboard(store));
    expect(result.current.layout).toHaveLength(1);
    expect(result.current.layout[0].type).toBe("status");
  });

  it("persists the whole store (admin + user + mobile) once per mutation", () => {
    const { result } = renderHook(() => useDashboard(null));
    act(() => result.current.addWidget("clock"));
    expect(setDashboardsAction).toHaveBeenCalledTimes(1);
    const arg = setDashboardsAction.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toHaveProperty("admin");
    expect(arg).toHaveProperty("user");
    expect(arg).toHaveProperty("mobile");
    expect(result.current.layout.some((t) => t.type === "clock")).toBe(true);
  });

  it("prunes a removed widget's uid from the role's mobile overlay", () => {
    const uid = "status-0";
    const store = {
      admin: [{ uid, type: "status", x: 0, y: 0, w: 4, h: 4 }],
      user: [],
      mobile: { admin: { order: [uid], hidden: [] } },
    };
    const { result } = renderHook(() => useDashboard(store));
    act(() => result.current.removeWidget(uid));
    expect(result.current.overlay?.order ?? []).not.toContain(uid);
    const arg = setDashboardsAction.mock.calls.at(-1)![0] as { mobile: { admin: { order: string[] } } };
    expect(arg.mobile.admin.order).not.toContain(uid);
  });

  it("setLayout accepts both an array and a functional updater", () => {
    const store = { admin: [{ uid: "a-0", type: "status", x: 0, y: 0, w: 4, h: 4 }], user: [], mobile: {} };
    const { result } = renderHook(() => useDashboard(store));
    act(() => result.current.setLayout([{ uid: "b-0", type: "leaderboard", x: 0, y: 0, w: 4, h: 4 }]));
    expect(result.current.layout.map((t) => t.uid)).toEqual(["b-0"]);
    act(() => result.current.setLayout((prev) => [...prev, { uid: "c-0", type: "status", x: 0, y: 0, w: 4, h: 4 }]));
    expect(result.current.layout.map((t) => t.uid)).toEqual(["b-0", "c-0"]);
  });

  it("updateSettings patches a single tile's settings", () => {
    const store = { admin: [{ uid: "mr-0", type: "myRequests", x: 0, y: 0, w: 4, h: 4 }], user: [], mobile: {} };
    const { result } = renderHook(() => useDashboard(store));
    act(() => result.current.updateSettings("mr-0", { limit: 5 }));
    expect(result.current.layout[0].settings).toEqual({ limit: 5 });
  });

  it("mobileHide moves a uid into hidden, mobileShow brings it back", () => {
    const store = { admin: [{ uid: "s-0", type: "status", x: 0, y: 0, w: 4, h: 4 }], user: [], mobile: {} };
    const { result } = renderHook(() => useDashboard(store));
    act(() => result.current.mobileHide("s-0"));
    expect(result.current.overlay?.hidden).toContain("s-0");
    act(() => result.current.mobileShow("s-0"));
    expect(result.current.overlay?.hidden ?? []).not.toContain("s-0");
  });

  it("mobileReorder writes an explicit stack order covering the visible tiles", () => {
    const store = {
      admin: [
        { uid: "a-0", type: "status", x: 0, y: 0, w: 4, h: 4 },
        { uid: "b-0", type: "leaderboard", x: 0, y: 4, w: 4, h: 4 },
      ],
      user: [],
      mobile: {},
    };
    const { result } = renderHook(() => useDashboard(store));
    act(() => result.current.mobileReorder("a-0", 1));
    // The first tile moved down → explicit order is recorded with both uids present.
    expect(result.current.overlay?.order).toEqual(["b-0", "a-0"]);
  });

  it("resetLayout restores the default layout and clears the role overlay", () => {
    const store = {
      admin: [{ uid: "s-0", type: "status", x: 0, y: 0, w: 4, h: 4 }],
      user: [],
      mobile: { admin: { order: ["s-0"], hidden: ["s-0"] } },
    };
    const { result } = renderHook(() => useDashboard(store));
    act(() => result.current.resetLayout());
    expect(result.current.layout.length).toBeGreaterThan(1);
    expect(result.current.overlay).toEqual({ order: [], hidden: [] });
  });

  it("toggleEdit flips the editing flag", () => {
    const { result } = renderHook(() => useDashboard(null));
    expect(result.current.editing).toBe(false);
    act(() => result.current.toggleEdit());
    expect(result.current.editing).toBe(true);
  });

  it("renderWidget renders a catalog widget and falls back to Empty for an unknown type", () => {
    const { result } = renderHook(() => useDashboard(null));
    const known = result.current.renderWidget({ uid: "s-0", type: "status", x: 0, y: 0, w: 4, h: 4 });
    expect(known).toBeTruthy();
    const unknown = result.current.renderWidget({ uid: "x-0", type: "nope", x: 0, y: 0, w: 4, h: 4 });
    // Unknown types resolve to the Empty placeholder element rather than throwing.
    expect(unknown).toBeTruthy();
  });

  it("openService navigates to the service route", () => {
    const { result } = renderHook(() => useDashboard(null));
    act(() => result.current.openService({ id: "sonarr" } as never));
    expect(push).toHaveBeenCalledWith("/s/sonarr");
  });

  it("modal open-state setters update their slices", () => {
    const { result } = renderHook(() => useDashboard(null));
    act(() => result.current.setAddOpen(true));
    expect(result.current.addOpen).toBe(true);
    act(() => result.current.setConfigUid("s-0"));
    expect(result.current.configUid).toBe("s-0");
    act(() => result.current.setReqPick({ id: 1 } as never));
    expect(result.current.reqPick).toEqual({ id: 1 });
    act(() => result.current.setUpcomingPick({ id: "u1" } as never));
    expect(result.current.upcomingPick).toEqual({ id: "u1" });
  });
});
