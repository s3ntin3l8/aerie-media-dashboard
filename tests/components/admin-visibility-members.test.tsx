import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ── Hoisted stubs ─────────────────────────────────────────────────────────────
const mockSetVisibility = vi.hoisted(() => vi.fn(async () => {}));
const mockSetUserOverseerrQuota = vi.hoisted(() => vi.fn(async () => {}));
const mockRefresh = vi.hoisted(() => vi.fn());

vi.mock("@/app/(portal)/admin/actions", () => ({
  setVisibility: mockSetVisibility,
  setUserOverseerrQuota: mockSetUserOverseerrQuota,
}));
vi.mock("@/components/portal/DataProvider", () => ({
  useData: vi.fn(),
  useRefresh: () => mockRefresh,
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ user: { id: "u1", name: "Ada", email: "a@x" } }),
}));
vi.mock("@/components/ServiceLogo", () => ({
  ServiceLogo: ({ service }: { service: { name: string } }) => (
    <span data-testid={`logo-${service.name}`} />
  ),
}));

import { useData } from "@/components/portal/DataProvider";
import { AdminVisibility } from "@/components/views/admin/AdminVisibility";
import { AdminMembers } from "@/components/views/admin/AdminMembers";

const SERVICE = { id: "sonarr", name: "Sonarr", cat: "automation", icon: "dns", host: "s.test", scheme: "https", status: "up" as const, uptime: 99, ms: 5, beats: [], active: true, embeddable: false, keepAlive: false };
const GROUP = { name: "admins", label: "Admins" };

const USER_ADMIN = {
  id: "u1", name: "Ada", email: "ada@x.com", role: "admin" as const,
  groups: ["admins"], linked: true, avatar: undefined,
  movieQuota: { limit: 10, days: 7, used: 2, restricted: false },
  tvQuota: { limit: null, days: 7, used: 0, restricted: false },
};
const USER_MEMBER = {
  id: "u2", name: "Bob", email: "bob@x.com", role: "user" as const,
  groups: [], linked: false, avatar: undefined,
  movieQuota: null, tvQuota: null,
};

const SNAP_VIS = {
  allServices: [SERVICE],
  groups: [GROUP],
  visibility: [{ serviceId: "sonarr", groupName: "admins", visible: true }],
};
const SNAP_MEMBERS = { users: [USER_ADMIN, USER_MEMBER] };

beforeEach(() => {
  vi.clearAllMocks();
});

// ── AdminVisibility (desktop) ──────────────────────────────────────────────────

describe("AdminVisibility — desktop", () => {
  beforeEach(() => {
    vi.mocked(useData).mockReturnValue(SNAP_VIS as never);
  });

  it("renders service and group header", () => {
    render(<AdminVisibility isMobile={false} />);
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
    expect(screen.getByText("admins")).toBeInTheDocument();
  });

  it("shows visibility toggles for each service×group pair", () => {
    render(<AdminVisibility isMobile={false} />);
    expect(screen.getByLabelText("Sonarr visible to admins")).toBeInTheDocument();
  });

  it("calls setVisibility and optimistically updates when a toggle is clicked", async () => {
    render(<AdminVisibility isMobile={false} />);
    fireEvent.click(screen.getByLabelText("Sonarr visible to admins"));
    await waitFor(() => expect(mockSetVisibility).toHaveBeenCalledWith("sonarr", "admins", false));
  });

  it("renders with empty visibility state when no saved visibility rows", () => {
    vi.mocked(useData).mockReturnValue({ ...SNAP_VIS, visibility: [] } as never);
    render(<AdminVisibility isMobile={false} />);
    expect(screen.getByLabelText("Sonarr visible to admins")).toBeInTheDocument();
  });
});

// ── AdminVisibility (mobile) ──────────────────────────────────────────────────

describe("AdminVisibility — mobile", () => {
  beforeEach(() => {
    vi.mocked(useData).mockReturnValue(SNAP_VIS as never);
  });

  it("renders mobile card layout with service name and group toggle", () => {
    render(<AdminVisibility isMobile={true} />);
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
    // Mobile aria-label includes the on/off state
    expect(screen.getByLabelText("Sonarr visible to admins: on")).toBeInTheDocument();
  });

  it("calls setVisibility on toggle click in mobile layout", async () => {
    render(<AdminVisibility isMobile={true} />);
    fireEvent.click(screen.getByLabelText("Sonarr visible to admins: on"));
    await waitFor(() => expect(mockSetVisibility).toHaveBeenCalledWith("sonarr", "admins", false));
  });
});

// ── AdminMembers ──────────────────────────────────────────────────────────────

describe("AdminMembers", () => {
  beforeEach(() => {
    vi.mocked(useData).mockReturnValue(SNAP_MEMBERS as never);
  });

  it("renders both users with their names and emails", () => {
    render(<AdminMembers isMobile={false} />);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("ada@x.com")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("bob@x.com")).toBeInTheDocument();
  });

  it("renders an Admin pill for the admin user", () => {
    render(<AdminMembers isMobile={false} />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("shows 'linked' status for the linked user", () => {
    render(<AdminMembers isMobile={false} />);
    expect(screen.getByText("linked")).toBeInTheDocument();
  });

  it("shows 'unlinked' status for unlinked user", () => {
    render(<AdminMembers isMobile={false} />);
    expect(screen.getByText("unlinked")).toBeInTheDocument();
  });

  it("shows group chip for the admin user", () => {
    render(<AdminMembers isMobile={false} />);
    expect(screen.getByText("admins")).toBeInTheDocument();
  });

  it("shows TV as unlimited (∞) when tvQuota.limit is null", () => {
    render(<AdminMembers isMobile={false} />);
    // The quota row shows "used/∞" — check that "∞" appears
    expect(screen.getAllByText(/∞/)[0]).toBeInTheDocument();
  });

  it("renders movie quota with correct used/limit display", () => {
    render(<AdminMembers isMobile={false} />);
    // movieQuota: used=2, limit=10 → "2/10"
    expect(screen.getByText("2/10")).toBeInTheDocument();
  });

  it("calls setUserOverseerrQuota and refresh when unlimited checkbox is toggled", async () => {
    render(<AdminMembers isMobile={false} />);
    // Find the movie unlimited checkbox (the first ∞ checkbox for Ada)
    const unlimCheckboxes = screen.getAllByRole("checkbox");
    // First checkbox is movie unlimited (currently false because limit=10)
    fireEvent.click(unlimCheckboxes[0]);
    await waitFor(() =>
      expect(mockSetUserOverseerrQuota).toHaveBeenCalledWith("u1", expect.objectContaining({ movieQuotaLimit: null }))
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });
});
