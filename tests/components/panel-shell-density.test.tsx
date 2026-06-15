import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// PanelShell is the shared chrome for ~40 widgets. It lives in the heavy panels.tsx module, so
// stub that module's load-time deps (same pattern as dashboard-widgets.test.tsx). The behaviour
// under test is purely the useStacked()-driven header density, which needs no real data.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => ({ role: "admin", user: { id: "u1" } }) }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: () => ({}), useRefresh: () => vi.fn() }));

import { PanelShell } from "@/components/panels";
import { StackedContext } from "@/components/portal/StackedContext";

const titlePx = (name: string) => parseFloat(screen.getByRole("heading", { name }).style.fontSize);

describe("PanelShell — mobile density", () => {
  it("renders a tighter title on the stacked (mobile) path than on desktop", () => {
    // Default context (false) → desktop density.
    const { unmount } = render(
      <PanelShell title="Desktop" icon="bolt">
        body
      </PanelShell>,
    );
    const desktop = titlePx("Desktop");
    unmount();

    // Inside the stacked provider → compact header.
    render(
      <StackedContext.Provider value={true}>
        <PanelShell title="Mobile" icon="bolt">
          body
        </PanelShell>
      </StackedContext.Provider>,
    );
    const mobile = titlePx("Mobile");

    expect(mobile).toBeLessThan(desktop);
  });
});
