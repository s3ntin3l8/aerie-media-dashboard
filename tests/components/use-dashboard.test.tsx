import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// useDashboard owns the per-role layouts + mobile overlay and persists the whole store on every
// edit. We exercise it against the REAL widgetCatalog/gridLayout (so default seeding + layout math
// are genuine) with only the side-effecting deps mocked. The admin/actions + navigation + provider
// mocks mirror widget-catalog-render.test.tsx, which imports the same panel graph.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => ({ role: "admin" }) }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(() => ({})), useRefresh: () => vi.fn() }));
vi.mock("@/components/hooks/useRequestReview", () => ({ useRequestReview: () => ({ onAct: vi.fn() }) }));
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
const setDashboardsAction = vi.fn();
vi.mock("@/app/(portal)/actions", () => ({ setDashboardsAction: (...a: unknown[]) => setDashboardsAction(...a) }));
vi.mock("@/app/(portal)/requests/actions", () => ({ resolveDiscoverItem: vi.fn(async () => null) }));

import { useDashboard } from "@/components/portal/useDashboard";

beforeEach(() => setDashboardsAction.mockClear());

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
});
