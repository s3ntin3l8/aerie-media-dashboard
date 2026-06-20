import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Hoist mutable stubs so vi.mock factories can reference them.
const { mockPush, mockPathname } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockPathname: vi.fn(() => "/"),
}));

// ── Provider / navigation mocks ────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  usePathname: mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

const portal = {
  user: { id: "u1", name: "Ada", email: "a@x" },
  role: "admin",
  realRole: "admin",
  theme: "dark",
  toggleTheme: vi.fn(),
  setPaletteOpen: vi.fn(),
  modalOpen: false,
  setModalOpen: vi.fn(),
  favorites: [],
  toggleFavorite: vi.fn(),
  signOut: vi.fn(),
  oidc: true,
  keptAliveIds: [],
  initialDashboards: null,
};
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));

const snap = {
  services: [] as unknown[],
  users: [{ id: "u1", name: "Ada", email: "a@x", role: "admin" as const, avatar: undefined }],
  requests: [
    { id: "r1", status: "pending" as const, title: "Movie", type: "movie", year: "", poster: "", userId: "u2", userEmail: "" },
    { id: "r2", status: "approved" as const, title: "Show", type: "tv", year: "", poster: "", userId: "u2", userEmail: "" },
  ],
};
vi.mock("@/components/portal/DataProvider", () => ({ useData: () => snap }));

// Stub heavy screen components so MobilePortal tests don't pull in all deps
vi.mock("@/components/mobile/screens/MobileDashboard", () => ({ MobileDashboard: () => <div data-testid="screen-dashboard" /> }));
vi.mock("@/components/mobile/screens/MobileStreams", () => ({ MobileStreams: () => <div data-testid="screen-streams" /> }));
vi.mock("@/components/mobile/screens/MobileRequests", () => ({ MobileRequests: () => <div data-testid="screen-requests" /> }));
// MobileStatus is no longer routed from MobilePortal (merged into MobileServices); mock kept so
// mobile-screens-render.test.tsx still compiles without dep changes.
vi.mock("@/components/mobile/screens/MobileStatus", () => ({ MobileStatus: () => <div data-testid="screen-status" /> }));
vi.mock("@/components/mobile/screens/MobileServices", () => ({ MobileServices: () => <div data-testid="screen-services" /> }));
vi.mock("@/components/mobile/screens/MobileAdmin", () => ({ MobileAdmin: () => <div data-testid="screen-mobile-admin" /> }));
vi.mock("@/components/mobile/screens/MobileServiceView", () => ({ MobileServiceView: () => <div data-testid="screen-service-view" /> }));
vi.mock("@/components/views/Admin", () => ({ Admin: () => <div data-testid="screen-admin" /> }));
vi.mock("@/components/portal/CommandPalette", () => ({ CommandPalette: () => <div data-testid="palette" /> }));

import { MobileAppBar } from "@/components/mobile/MobileAppBar";
import { MobileNav } from "@/components/mobile/MobileNav";
import { MobilePortal } from "@/components/mobile/MobilePortal";

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname.mockReturnValue("/");
  portal.role = "admin";
  snap.services = [];
});

// ── MobileAppBar ──────────────────────────────────────────────────────────────

describe("MobileAppBar", () => {
  it("renders the AERIE brand label", () => {
    render(<MobileAppBar onAdmin={vi.fn()} />);
    expect(screen.getByText("AERIE")).toBeInTheDocument();
  });

  it("calls setPaletteOpen(true) when the search button is clicked", () => {
    render(<MobileAppBar onAdmin={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Search"));
    expect(portal.setPaletteOpen).toHaveBeenCalledWith(true);
  });

  it("calls toggleTheme when the theme button is clicked", () => {
    render(<MobileAppBar onAdmin={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Toggle theme"));
    expect(portal.toggleTheme).toHaveBeenCalledTimes(1);
  });

  it("calls onAdmin when the avatar/profile button is clicked", () => {
    const onAdmin = vi.fn();
    render(<MobileAppBar onAdmin={onAdmin} />);
    fireEvent.click(screen.getByLabelText("Open admin panel"));
    expect(onAdmin).toHaveBeenCalledTimes(1);
  });

  it("shows 'Profile' aria-label for non-admin role", () => {
    portal.role = "user";
    render(<MobileAppBar onAdmin={vi.fn()} />);
    expect(screen.getByLabelText("Profile")).toBeInTheDocument();
  });
});

// ── MobileNav ─────────────────────────────────────────────────────────────────

describe("MobileNav", () => {
  it("renders Dashboard, Streams, Services, My Requests nav items (Status merged into Services)", () => {
    render(<MobileNav />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Streams")).toBeInTheDocument();
    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("My Requests")).toBeInTheDocument();
    // "Status" no longer exists as a separate nav item — merged into "Services".
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });

  it("does not render the Admin item (adminOnly, filtered out of MOBILE_NAV_ITEMS)", () => {
    render(<MobileNav />);
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("shows a pending-request badge count for admin", () => {
    // snap.requests has 1 pending item
    render(<MobileNav />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("does not show a pending badge for non-admin role", () => {
    portal.role = "user";
    render(<MobileNav />);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("calls router.push with the item href when a nav item is clicked", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByText("Streams"));
    expect(mockPush).toHaveBeenCalledWith("/streams");
  });
});

// ── MobilePortal ──────────────────────────────────────────────────────────────

describe("MobilePortal", () => {
  it("renders the Dashboard screen at '/'", () => {
    render(<MobilePortal />);
    expect(screen.getByTestId("screen-dashboard")).toBeInTheDocument();
  });

  it("renders the Streams screen at '/streams'", () => {
    mockPathname.mockReturnValue("/streams");
    render(<MobilePortal />);
    expect(screen.getByTestId("screen-streams")).toBeInTheDocument();
  });

  it("renders the Requests screen at '/requests'", () => {
    mockPathname.mockReturnValue("/requests");
    render(<MobilePortal />);
    expect(screen.getByTestId("screen-requests")).toBeInTheDocument();
  });

  it("renders the merged Services screen (MobileServices) at '/status'", () => {
    // /status now routes to the merged Services screen (browse + health).
    mockPathname.mockReturnValue("/status");
    render(<MobilePortal />);
    expect(screen.getByTestId("screen-services")).toBeInTheDocument();
  });

  it("renders the Services screen at legacy '/services' path too", () => {
    // /services server-redirects to /status; the client-side fallback renders MobileServices.
    mockPathname.mockReturnValue("/services");
    render(<MobilePortal />);
    expect(screen.getByTestId("screen-services")).toBeInTheDocument();
  });

  it("renders the Admin view at '/admin'", () => {
    mockPathname.mockReturnValue("/admin");
    render(<MobilePortal />);
    expect(screen.getByTestId("screen-admin")).toBeInTheDocument();
  });

  it("renders AppBar and Nav on non-service routes", () => {
    render(<MobilePortal />);
    expect(screen.getByText("AERIE")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("hides AppBar and Nav when a known service is active at /s/:id", () => {
    snap.services = [{
      id: "sonarr", name: "Sonarr", cat: "automation", icon: "dns", host: "sonarr.test",
      scheme: "https", status: "up", uptime: 99, ms: 5, beats: [], active: true, embeddable: false, keepAlive: false,
    }];
    mockPathname.mockReturnValue("/s/sonarr");
    render(<MobilePortal />);
    expect(screen.getByTestId("screen-service-view")).toBeInTheDocument();
    expect(screen.queryByText("AERIE")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("opens MobileAdmin sheet for admin when admin button is tapped", () => {
    render(<MobilePortal />);
    fireEvent.click(screen.getByLabelText("Open admin panel"));
    expect(screen.getByTestId("screen-mobile-admin")).toBeInTheDocument();
  });
});
