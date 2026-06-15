import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// MobileDashboard is the phone home: native greeting + Edit/Reset/Add chrome around the shared
// DashboardBody (forced into the stacked layout). We stub DashboardBody + useDashboard so the
// test focuses on the chrome's branches and that its buttons drive the api.

let api: Record<string, unknown>;
vi.mock("@/components/portal/useDashboard", () => ({ useDashboard: () => api }));
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => ({ user: { name: "Ada" }, initialDashboards: null }) }));
vi.mock("@/components/portal/DashboardBody", () => ({
  DashboardBody: (p: { forceStacked?: boolean }) => <div data-testid="body" data-force={String(!!p.forceStacked)} />,
}));

import { MobileDashboard } from "@/components/mobile/screens/MobileDashboard";

beforeEach(() => {
  api = { editing: false, toggleEdit: vi.fn(), resetLayout: vi.fn(), setAddOpen: vi.fn() };
});

describe("MobileDashboard", () => {
  it("greets the user and renders the body forced into the stacked layout (not editing)", () => {
    render(<MobileDashboard />);
    expect(screen.getByText(/Ada\./)).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    // No edit-only controls when not editing.
    expect(screen.queryByText("Reset")).not.toBeInTheDocument();
    expect(screen.queryByText("Add widget")).not.toBeInTheDocument();
    expect(screen.getByTestId("body")).toHaveAttribute("data-force", "true");
  });

  it("toggles edit mode from the Edit button", () => {
    render(<MobileDashboard />);
    fireEvent.click(screen.getByText("Edit"));
    expect(api.toggleEdit).toHaveBeenCalled();
  });

  it("exposes Arrange/Reset/Add/Done while editing and wires their handlers", () => {
    api.editing = true;
    render(<MobileDashboard />);
    expect(screen.getByText("Arrange dashboard")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Reset"));
    expect(api.resetLayout).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Add widget"));
    expect(api.setAddOpen).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText("Done"));
    expect(api.toggleEdit).toHaveBeenCalled();
  });
});
