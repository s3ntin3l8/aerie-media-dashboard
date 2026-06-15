import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// getPlexPanelData drives the panel; the action mocks just need to exist as fns.
const panel = vi.hoisted(() => ({
  value: {
    configured: true,
    hasToken: true,
    sections: [
      { id: "1", title: "Movies", type: "movie", agent: "", refreshing: false, scannedAt: 3000 },
      { id: "2", title: "Anime", type: "show", agent: "", refreshing: true, scannedAt: 1000 },
      { id: "3", title: "Music", type: "artist", agent: "", refreshing: false, scannedAt: 2000 },
    ],
    tasks: [
      { name: "Backup", title: "Backup", description: "", enabled: true, interval: 3 },
      { name: "Trim", title: "Trim", description: "", enabled: false, interval: 7 },
      { name: "Vacuum", title: "Vacuum", description: "", enabled: true, interval: 1 },
    ],
  } as unknown,
}));

vi.mock("@/app/(portal)/admin/plex-actions", () => ({
  getPlexPanelData: vi.fn(async () => panel.value),
  scanSectionAction: vi.fn(),
  analyzeSectionAction: vi.fn(),
  emptyTrashAction: vi.fn(),
  cleanBundlesAction: vi.fn(),
  optimizeDbAction: vi.fn(),
  runButlerTaskAction: vi.fn(),
}));

import { AdminPlex } from "@/components/views/admin/AdminPlex";

const libOrder = () => screen.getAllByText(/^(Anime|Movies|Music)$/).map((e) => e.textContent);
const taskOrder = () => screen.getAllByText(/^(Backup|Trim|Vacuum)$/).map((e) => e.textContent);
const clickHeader = (label: string) => fireEvent.click(screen.getByText(label).closest("button")!);

const renderPanel = async () => {
  render(<AdminPlex flash={vi.fn()} isMobile={false} />);
  await screen.findByText("Movies"); // wait for the async panel load
};

beforeEach(() => vi.clearAllMocks());

describe("AdminPlex — libraries table sorting", () => {
  it("defaults to title A→Z", async () => {
    await renderPanel();
    expect(libOrder()).toEqual(["Anime", "Movies", "Music"]);
  });

  it("sorts by Last scanned (oldest→newest, toggling on repeat clicks)", async () => {
    await renderPanel();
    clickHeader("Last scanned"); // asc by scannedAt: Anime(1000), Music(2000), Movies(3000)
    expect(libOrder()).toEqual(["Anime", "Music", "Movies"]);
    clickHeader("Last scanned"); // desc
    expect(libOrder()).toEqual(["Movies", "Music", "Anime"]);
  });
});

describe("AdminPlex — scheduled tasks table sorting", () => {
  it("defaults to title A→Z", async () => {
    await renderPanel();
    expect(taskOrder()).toEqual(["Backup", "Trim", "Vacuum"]);
  });

  it("sorts by Interval ascending", async () => {
    await renderPanel();
    clickHeader("Interval"); // asc by interval: Vacuum(1), Backup(3), Trim(7)
    expect(taskOrder()).toEqual(["Vacuum", "Backup", "Trim"]);
  });
});

describe("AdminPlex — interval formatting (days, not seconds)", () => {
  it("renders daily / every Nd / weekly instead of 'every 0h'", async () => {
    await renderPanel();
    await waitFor(() => {
      expect(screen.getByText("every 3d")).toBeTruthy(); // interval 3
      expect(screen.getByText("weekly")).toBeTruthy();   // interval 7
      expect(screen.getByText("daily")).toBeTruthy();    // interval 1
    });
    expect(screen.queryByText("every 0h")).toBeNull();
  });
});
