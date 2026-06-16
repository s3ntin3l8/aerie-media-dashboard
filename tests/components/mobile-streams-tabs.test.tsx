import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// MobileStreams: the Live stream card and the Live/History tab switch (History reuses the
// shared HistoryList, which fetches /api/history). The smoke test only renders the empty Live tab.

// HistoryList → panels imports a server action (lib/db via "server-only"); stub it for jsdom.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));

const portal: { role: string; user: { id: string } } = { role: "admin", user: { id: "u1" } };
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn(), useSnapshotTime: () => 0 }));

import { useData } from "@/components/portal/DataProvider";
import { MobileStreams } from "@/components/mobile/screens/MobileStreams";

const session = {
  id: "s1", title: "Inception", kind: "movie", year: 2010, user: "Ada", src: "plex", device: "Chrome",
  res: "1080p", play: "transcode", bitrate: "8.0", codec: "H264", pos: 0.5, dur: 148, paused: false,
  art: "/api/artwork?x", platform: "Chrome", product: "Plex Web", qualityProfile: "Original",
  location: "wan", ipPublic: "1.2.3.4", videoDecision: "transcode", audioDecision: "copy", hwTranscode: true,
  geo: { city: "Berlin", region: "BE", country: "Germany", code: "DE", lat: 52, lon: 13 },
};

beforeEach(() => {
  portal.role = "admin";
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ history: [] }) })) as never);
});

describe("MobileStreams — tabs", () => {
  it("renders the live stream card with the active/paused summary", () => {
    vi.mocked(useData).mockReturnValue({ nowPlaying: [session] } as never);
    render(<MobileStreams />);
    expect(screen.getByText("Inception")).toBeInTheDocument();
    expect(screen.getByText(/active ·/)).toBeInTheDocument();
  });

  it("switches to the History tab and mounts the shared history list", async () => {
    vi.mocked(useData).mockReturnValue({ nowPlaying: [session] } as never);
    render(<MobileStreams />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    // HistoryList resolves the (empty) /api/history fetch into its empty state.
    expect(await screen.findByText(/No streams in the last 7 days/)).toBeInTheDocument();
    // The live card is no longer shown.
    expect(screen.queryByText("Inception")).not.toBeInTheDocument();
  });

  it("scopes streams to the member's own sessions for non-admins", () => {
    portal.role = "user";
    portal.user = { id: "someone-else" };
    vi.mocked(useData).mockReturnValue({ nowPlaying: [session] } as never);
    render(<MobileStreams />);
    expect(screen.getByText(/Nothing is playing right now/)).toBeInTheDocument();
  });
});
