import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ModalShell (imported by IconPicker) uses usePortal → PortalProvider → @/auth → next-auth.
// Mock PortalProvider to avoid the server-module resolution error in jsdom.
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ setModalOpen: vi.fn(), modalOpen: false }),
}));

// Stub the dashboard icon img so no real network calls are made
vi.mock("@/components/DashboardIconImg", () => ({
  DashboardIconImg: ({ alt, slug }: { alt?: string; slug?: string }) => (
    <img alt={alt ?? slug ?? ""} data-testid="icon-img" />
  ),
}));

import { IconPicker } from "@/components/modals/IconPicker";

const RESULTS = [
  { slug: "sonarr", name: "Sonarr", url: "https://cdn.example.com/sonarr.png" },
  { slug: "radarr", name: "Radarr", url: "https://cdn.example.com/radarr.png" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => RESULTS })) as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("IconPicker", () => {
  it("renders the search input", () => {
    render(<IconPicker value="" onChange={vi.fn()} catColor="var(--primary)" />);
    expect(screen.getByPlaceholderText(/Search icons/)).toBeInTheDocument();
  });

  it("does NOT show current-value panel when value is empty", () => {
    render(<IconPicker value="" onChange={vi.fn()} catColor="var(--primary)" />);
    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
  });

  it("shows current value and a Clear button when value is set", () => {
    render(<IconPicker value="plex" onChange={vi.fn()} catColor="var(--primary)" />);
    expect(screen.getByText("plex")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("calls onChange('') when Clear is clicked", () => {
    const onChange = vi.fn();
    render(<IconPicker value="plex" onChange={onChange} catColor="var(--primary)" />);
    fireEvent.click(screen.getByText("Clear"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("fetches icon results after 250ms debounce and renders them", async () => {
    render(<IconPicker value="" onChange={vi.fn()} catColor="var(--primary)" />);
    fireEvent.change(screen.getByPlaceholderText(/Search icons/), { target: { value: "sonarr" } });
    // Before debounce fires, no results
    expect(screen.queryByTitle("Sonarr")).not.toBeInTheDocument();
    // Flush timers + pending promises together
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByTitle("Sonarr")).toBeInTheDocument();
    expect(screen.getByTitle("Radarr")).toBeInTheDocument();
  });

  it("does not fetch when the query is blank", async () => {
    render(<IconPicker value="" onChange={vi.fn()} catColor="var(--primary)" />);
    fireEvent.change(screen.getByPlaceholderText(/Search icons/), { target: { value: "  " } });
    await act(() => vi.runAllTimersAsync());
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("calls onChange with the slug and clears search when a result is clicked", async () => {
    const onChange = vi.fn();
    render(<IconPicker value="" onChange={onChange} catColor="var(--primary)" />);
    fireEvent.change(screen.getByPlaceholderText(/Search icons/), { target: { value: "sonarr" } });
    await act(() => vi.runAllTimersAsync());
    expect(screen.getByTitle("Sonarr")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Sonarr"));
    expect(onChange).toHaveBeenCalledWith("sonarr");
    // Results should be cleared after selection
    expect(screen.queryByTitle("Sonarr")).not.toBeInTheDocument();
  });

  it("renders the attribution footer link", () => {
    render(<IconPicker value="" onChange={vi.fn()} catColor="var(--primary)" />);
    expect(screen.getByText("dashboard-icons")).toBeInTheDocument();
  });
});
