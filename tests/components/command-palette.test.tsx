import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { Service } from "@/lib/types";

// ---- mocks ----------------------------------------------------------------
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const setPaletteOpen = vi.fn();
const portalState = { paletteOpen: true, setPaletteOpen, role: "admin" as "admin" | "user" };
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => portalState,
}));

// useVisibleServices pulls in useData/usePortal/visibility — stub it with a fixed list.
const visibleServices: Service[] = [
  { id: "radarr", name: "Radarr", host: "radarr.example.com", icon: "movie", cat: "media", embeddable: true },
  { id: "sonarr", name: "Sonarr", host: "sonarr.example.com", icon: "tv", cat: "media", embeddable: false },
] as unknown as Service[];
vi.mock("@/components/hooks/useVisibleServices", () => ({
  useVisibleServices: () => visibleServices,
}));

// ServiceLogo renders an <img>/icon stack — replace with a marker to keep the DOM simple.
vi.mock("@/components/ServiceLogo", () => ({
  ServiceLogo: ({ service }: { service: Service }) => <span data-testid="svc-logo">{service.id}</span>,
}));

import { CommandPalette } from "@/components/portal/CommandPalette";

beforeEach(() => {
  vi.clearAllMocks();
  portalState.paletteOpen = true;
  portalState.role = "admin";
});

function input() {
  return screen.getByPlaceholderText("Search services, pages, requests…") as HTMLInputElement;
}

describe("CommandPalette", () => {
  it("renders nothing when paletteOpen is false", () => {
    portalState.paletteOpen = false;
    const { container } = render(<CommandPalette />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists nav items and services when open with an empty query", () => {
    render(<CommandPalette />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Radarr")).toBeInTheDocument();
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
    // section eyebrows ("Services" also appears as a nav label, hence getAllByText)
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getAllByText("Services").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the admin nav item only for admins", () => {
    render(<CommandPalette />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("hides admin-only nav items from members", () => {
    portalState.role = "user";
    render(<CommandPalette />);
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    // non-admin nav still present
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("filters services by name (case-insensitive)", () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: "rad" } });
    expect(screen.getByText("Radarr")).toBeInTheDocument();
    expect(screen.queryByText("Sonarr")).not.toBeInTheDocument();
  });

  it("filters services by host substring", () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: "sonarr.example" } });
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
    expect(screen.queryByText("Radarr")).not.toBeInTheDocument();
  });

  it("filters nav items by label", () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: "status" } });
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("shows a no-matches message when nothing matches", () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: "zzz-no-such-thing" } });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("navigates to a nav href and closes on click", () => {
    render(<CommandPalette />);
    fireEvent.click(screen.getByText("Status"));
    expect(push).toHaveBeenCalledWith("/status");
    expect(setPaletteOpen).toHaveBeenCalledWith(false);
  });

  it("navigates to a service launch route and closes on click", () => {
    render(<CommandPalette />);
    fireEvent.click(screen.getByText("Radarr"));
    expect(push).toHaveBeenCalledWith("/s/radarr");
    expect(setPaletteOpen).toHaveBeenCalledWith(false);
  });

  it("renders the embed/launch hint per service embeddability", () => {
    render(<CommandPalette />);
    expect(screen.getByText("embed")).toBeInTheDocument(); // radarr embeddable
    expect(screen.getByText("launch")).toBeInTheDocument(); // sonarr not embeddable
  });

  it("closes when the backdrop scrim is clicked", () => {
    const { container } = render(<CommandPalette />);
    // outermost div is the scrim with the onClick={close}
    fireEvent.click(container.firstChild as Element);
    expect(setPaletteOpen).toHaveBeenCalledWith(false);
  });

  it("does not close when the inner dialog is clicked (stopPropagation)", () => {
    render(<CommandPalette />);
    fireEvent.click(input());
    expect(setPaletteOpen).not.toHaveBeenCalled();
  });

  it("focuses the input shortly after opening", () => {
    vi.useFakeTimers();
    try {
      render(<CommandPalette />);
      vi.advanceTimersByTime(50);
      expect(document.activeElement).toBe(input());
    } finally {
      vi.useRealTimers();
    }
  });
});
