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
    // "Status" nav item is gone — merged into "Services". Filter by "admin" to test nav filtering.
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: "admin" } });
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("shows a no-matches message when nothing matches", () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: "zzz-no-such-thing" } });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("navigates to a nav href and closes on click", () => {
    // Filter to "admin" so only the Admin nav item matches (unambiguous click target).
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: "admin" } });
    fireEvent.click(screen.getByText("Admin"));
    expect(push).toHaveBeenCalledWith("/admin");
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

  describe("combobox / listbox semantics", () => {
    it("exposes a labelled dialog, a combobox wired to a listbox, and options", () => {
      render(<CommandPalette />);
      expect(screen.getByRole("dialog", { name: "Command palette" })).toHaveAttribute("aria-modal", "true");
      const box = screen.getByRole("combobox");
      const list = screen.getByRole("listbox");
      expect(box).toHaveAttribute("aria-expanded", "true");
      expect(box).toHaveAttribute("aria-controls", list.id);
      expect(screen.getAllByRole("option").length).toBeGreaterThan(2);
      expect(screen.getByRole("group", { name: "Navigate" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Services" })).toBeInTheDocument();
    });

    it("moves aria-activedescendant and aria-selected with the arrow keys", () => {
      render(<CommandPalette />);
      const box = screen.getByRole("combobox");
      const opts = () => screen.getAllByRole("option");
      expect(box).toHaveAttribute("aria-activedescendant", opts()[0].id);
      expect(opts()[0]).toHaveAttribute("aria-selected", "true");
      fireEvent.keyDown(box, { key: "ArrowDown" });
      expect(box).toHaveAttribute("aria-activedescendant", opts()[1].id);
      expect(opts()[0]).toHaveAttribute("aria-selected", "false");
      fireEvent.keyDown(box, { key: "ArrowUp" });
      fireEvent.keyDown(box, { key: "ArrowUp" }); // wraps to the last option
      expect(box).toHaveAttribute("aria-activedescendant", opts()[opts().length - 1].id);
      fireEvent.keyDown(box, { key: "Home" });
      expect(box).toHaveAttribute("aria-activedescendant", opts()[0].id);
      fireEvent.keyDown(box, { key: "End" });
      expect(box).toHaveAttribute("aria-activedescendant", opts()[opts().length - 1].id);
    });

    it("Enter opens the active option and closes", () => {
      render(<CommandPalette />);
      const box = screen.getByRole("combobox");
      const navCount = screen.getByRole("group", { name: "Navigate" }).querySelectorAll('[role="option"]').length;
      for (let n = 0; n < navCount; n++) fireEvent.keyDown(box, { key: "ArrowDown" }); // first service
      fireEvent.keyDown(box, { key: "Enter" });
      expect(push).toHaveBeenCalledWith("/s/radarr");
      expect(setPaletteOpen).toHaveBeenCalledWith(false);
    });

    it("Escape in the input closes the palette", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
      expect(setPaletteOpen).toHaveBeenCalledWith(false);
    });

    it("resets the active option to the first match when the query changes", () => {
      render(<CommandPalette />);
      const box = screen.getByRole("combobox");
      fireEvent.keyDown(box, { key: "ArrowDown" });
      fireEvent.change(box, { target: { value: "son" } });
      expect(box).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0].id);
    });

    it("has no active descendant and is collapsed when nothing matches; Enter does nothing", () => {
      render(<CommandPalette />);
      const box = screen.getByRole("combobox");
      fireEvent.change(box, { target: { value: "zzz-no-such-thing" } });
      expect(box).toHaveAttribute("aria-expanded", "false");
      expect(box).not.toHaveAttribute("aria-activedescendant");
      fireEvent.keyDown(box, { key: "ArrowDown" });
      fireEvent.keyDown(box, { key: "Enter" });
      expect(push).not.toHaveBeenCalled();
    });

    it("hovering an option makes it the active one", () => {
      render(<CommandPalette />);
      const opts = screen.getAllByRole("option");
      fireEvent.mouseMove(opts[2]);
      expect(screen.getByRole("combobox")).toHaveAttribute("aria-activedescendant", opts[2].id);
    });

    it("hovering a service option activates it (index continues after the nav items)", () => {
      render(<CommandPalette />);
      const svc = screen.getByRole("group", { name: "Services" }).querySelectorAll('[role="option"]')[1];
      fireEvent.mouseMove(svc);
      expect(screen.getByRole("combobox")).toHaveAttribute("aria-activedescendant", svc.id);
    });

    it("scrolls the active option into view when the arrow keys move it", () => {
      const scrollIntoView = vi.fn();
      const original = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = scrollIntoView;
      try {
        render(<CommandPalette />);
        scrollIntoView.mockClear();
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
      } finally {
        HTMLElement.prototype.scrollIntoView = original;
      }
    });

    it("returns focus to the opener when it closes", () => {
      const opener = document.createElement("button");
      document.body.appendChild(opener);
      opener.focus();
      const { rerender } = render(<CommandPalette />);
      portalState.paletteOpen = false;
      rerender(<CommandPalette />);
      expect(document.activeElement).toBe(opener);
      opener.remove();
    });
  });
});
