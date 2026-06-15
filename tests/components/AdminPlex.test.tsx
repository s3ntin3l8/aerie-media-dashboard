import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Hoisted mock surface for @/app/(portal)/admin/plex-actions. `panel.value` is what
// getPlexPanelData resolves to; each test sets it before rendering. Action mocks resolve
// the same { ok, message } shape the real server actions return.
const h = vi.hoisted(() => {
  const panel = { value: null as unknown };
  return {
    panel,
    getPlexPanelData: vi.fn(async () => panel.value),
    scanSectionAction: vi.fn(async () => ({ ok: true, message: "Library scan started" })),
    analyzeSectionAction: vi.fn(async () => ({ ok: true, message: "Analysis started" })),
    emptyTrashAction: vi.fn(async () => ({ ok: true, message: "Emptying trash" })),
    cleanBundlesAction: vi.fn(async () => ({ ok: true, message: "Clean bundles started" })),
    optimizeDbAction: vi.fn(async () => ({ ok: true, message: "Database optimization started" })),
    runButlerTaskAction: vi.fn(async () => ({ ok: true, message: "Task started" })),
  };
});

vi.mock("@/app/(portal)/admin/plex-actions", () => ({
  getPlexPanelData: h.getPlexPanelData,
  scanSectionAction: h.scanSectionAction,
  analyzeSectionAction: h.analyzeSectionAction,
  emptyTrashAction: h.emptyTrashAction,
  cleanBundlesAction: h.cleanBundlesAction,
  optimizeDbAction: h.optimizeDbAction,
  runButlerTaskAction: h.runButlerTaskAction,
}));

import { AdminPlex } from "@/components/views/admin/AdminPlex";

const fullData = (over: Record<string, unknown> = {}) => ({
  configured: true,
  hasToken: true,
  sections: [{ id: "1", title: "Movies", type: "movie", agent: "", refreshing: false }],
  tasks: [{ name: "ButlerTaskGenerateIntroMarkers", title: "Detect intros", description: "Find intro markers", enabled: true, interval: 259200 }],
  ...over,
});

const flash = vi.fn();
const renderPanel = () => render(<AdminPlex flash={flash} isMobile={false} />);

beforeEach(() => {
  vi.clearAllMocks();
  h.panel.value = fullData();
});

describe("AdminPlex — setup states", () => {
  it("prompts to configure Plex when no service is set up", async () => {
    h.panel.value = { configured: false, hasToken: false, sections: [], tasks: [] };
    renderPanel();
    expect(await screen.findByText(/Plex isn.t configured/)).toBeInTheDocument();
    // No library table / actions in the setup state.
    expect(screen.queryByText("Libraries")).not.toBeInTheDocument();
  });

  it("prompts to add a token when configured but no token is stored", async () => {
    h.panel.value = { configured: true, hasToken: false, sections: [], tasks: [] };
    renderPanel();
    expect(await screen.findByText("Add a Plex token")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scan/ })).not.toBeInTheDocument();
  });
});

describe("AdminPlex — library actions", () => {
  it("Scan triggers scanSectionAction(id) and flashes + re-reads on success", async () => {
    renderPanel();
    await screen.findByText("Plex Maintenance");

    fireEvent.click(screen.getByRole("button", { name: /Scan/ }));

    await waitFor(() => expect(h.scanSectionAction).toHaveBeenCalledWith("1"));
    expect(flash).toHaveBeenCalledWith("Library scan started");
    // Initial mount load + the post-action re-read.
    await waitFor(() => expect(h.getPlexPanelData).toHaveBeenCalledTimes(2));
  });

  it("Refresh metadata forces a full refresh (force=true)", async () => {
    renderPanel();
    await screen.findByText("Plex Maintenance");

    fireEvent.click(screen.getByRole("button", { name: /Refresh metadata/ }));

    await waitFor(() => expect(h.scanSectionAction).toHaveBeenCalledWith("1", true));
  });

  it("Analyze triggers analyzeSectionAction(id)", async () => {
    renderPanel();
    await screen.findByText("Plex Maintenance");

    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    await waitFor(() => expect(h.analyzeSectionAction).toHaveBeenCalledWith("1"));
  });

  it("Empty trash targets the section by id", async () => {
    renderPanel();
    await screen.findByText("Plex Maintenance");

    fireEvent.click(screen.getByRole("button", { name: /Empty trash/ }));

    await waitFor(() => expect(h.emptyTrashAction).toHaveBeenCalledWith("1"));
  });
});

describe("AdminPlex — housekeeping + butler", () => {
  it("Clean bundles calls cleanBundlesAction", async () => {
    renderPanel();
    await screen.findByText("Plex Maintenance");

    fireEvent.click(screen.getByRole("button", { name: /Clean bundles/ }));

    await waitFor(() => expect(h.cleanBundlesAction).toHaveBeenCalled());
  });

  it("Optimize database calls optimizeDbAction", async () => {
    renderPanel();
    await screen.findByText("Plex Maintenance");

    fireEvent.click(screen.getByRole("button", { name: /Optimize database/ }));

    await waitFor(() => expect(h.optimizeDbAction).toHaveBeenCalled());
  });

  it("Empty all trash calls emptyTrashAction with no id", async () => {
    renderPanel();
    await screen.findByText("Plex Maintenance");

    fireEvent.click(screen.getByRole("button", { name: /Empty all trash/ }));

    await waitFor(() => expect(h.emptyTrashAction).toHaveBeenCalledWith());
  });

  it("Run now runs the butler task by name", async () => {
    renderPanel();
    await screen.findByText("Detect intros");

    fireEvent.click(screen.getByRole("button", { name: /Run now/ }));

    await waitFor(() => expect(h.runButlerTaskAction).toHaveBeenCalledWith("ButlerTaskGenerateIntroMarkers"));
  });
});

describe("AdminPlex — edge states", () => {
  it("renders the error banner when the read reports an error", async () => {
    h.panel.value = fullData({ error: "Could not reach Plex — check the URL and token." });
    renderPanel();
    expect(await screen.findByText(/Could not reach Plex/)).toBeInTheDocument();
  });

  it("shows the Plex Pass note for the empty butler list but still renders libraries", async () => {
    h.panel.value = fullData({ tasks: [] });
    renderPanel();
    expect(await screen.findByText(/require Plex Pass/)).toBeInTheDocument();
    expect(screen.getByText("Movies")).toBeInTheDocument();
  });
});
