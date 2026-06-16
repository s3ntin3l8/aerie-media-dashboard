import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { Service } from "@/lib/types";

// Home is the only authenticated view without a render test, so its page body
// (the width-tier wrapper, the health ticker, and the no-services empty state)
// was uncovered. We stub the heavy dashboard grid + its api hook so the test
// exercises Home's own chrome and the #101 width-tier contract directly.

const push = vi.fn();
const data: { services: Service[]; nowPlaying: unknown[]; plays24h: unknown[]; bandwidth: unknown } = {
  services: [],
  nowPlaying: [],
  plays24h: [],
  bandwidth: null,
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Home → panels (Empty) imports a server action (lib/db via "server-only"); stub it for jsdom.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ setPaletteOpen: vi.fn(), user: { name: "Ada" }, initialDashboards: undefined }),
}));
vi.mock("@/components/portal/DataProvider", () => ({ useData: () => data }));
const dash = { editing: false };
vi.mock("@/components/portal/useDashboard", () => ({
  useDashboard: () => ({ role: "admin", layout: [], editing: dash.editing, toggleEdit: vi.fn(), resetLayout: vi.fn() }),
}));
vi.mock("@/components/portal/DashboardBody", () => ({
  DashboardBody: () => <div data-testid="dashboard-body" />,
}));

import { Home } from "@/components/views/Home";

const svc = (over: Partial<Service> = {}): Service =>
  ({ id: "plex", name: "Plex", status: "up", category: "media", ...over }) as Service;

beforeEach(() => {
  push.mockClear();
  data.services = [];
  data.nowPlaying = [];
  data.bandwidth = null;
  dash.editing = false;
});

describe("Home view", () => {
  it("wraps the body in the wide content tier (#101)", () => {
    const { container } = render(<Home />);
    // The page body opts into the fluid/dashboard width tier rather than a
    // hardcoded inline maxWidth — guards against a regression to the old caps.
    const body = container.querySelector<HTMLElement>(".aerie-page-pad.aerie-page-pad--wide");
    expect(body).not.toBeNull();
    // Not editing: no extra bottom padding reserved for the edit toolbar.
    expect(body!.style.paddingBottom).toBe("");
    expect(screen.getByTestId("dashboard-body")).toBeInTheDocument();
  });

  it("reserves bottom padding for the edit toolbar while editing", () => {
    dash.editing = true;
    const { container } = render(<Home />);
    const body = container.querySelector<HTMLElement>(".aerie-page-pad.aerie-page-pad--wide");
    expect(body!.style.paddingBottom).toBe("110px");
  });

  it("shows the no-services empty state and a 'No services configured' ticker when unconfigured", () => {
    render(<Home />);
    expect(screen.getByText("No services configured yet")).toBeInTheDocument();
    expect(screen.getByText("No services configured")).toBeInTheDocument();
  });

  it("reflects a healthy fleet in the ticker once services report up", () => {
    data.services = [svc(), svc({ id: "jellyfin", name: "Jellyfin" })];
    render(<Home />);
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
    // empty state is suppressed once services exist
    expect(screen.queryByText("No services configured yet")).not.toBeInTheDocument();
  });

  it("surfaces a down service in the ticker", () => {
    data.services = [svc(), svc({ id: "radarr", name: "Radarr", status: "down" })];
    render(<Home />);
    expect(screen.getByText("1 service down")).toBeInTheDocument();
  });
});
