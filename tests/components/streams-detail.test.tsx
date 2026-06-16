import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/streams" }));
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => ({ role: "admin", user: { id: "u1" }, modalOpen: false, setModalOpen: vi.fn() }) }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn(), useSnapshotTime: () => Date.now() }));
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("@/app/(portal)/requests/actions", () => Object.fromEntries(["submitRequest", "getMediaDetail", "resolveDiscoverItem"].map((n) => [n, vi.fn(async () => [])])));

import { useData } from "@/components/portal/DataProvider";
import { NowPlayingPanel, StreamsView } from "@/components/panels/streams";
import { Streams } from "@/components/views/Streams";

// A richly-populated session exercises StreamRow + the StreamDetail sub-blocks
// (quality, client, network, transcode tech).
const session = {
  id: "s1", title: "Inception", kind: "movie", year: 2010, user: "Ada", src: "plex", device: "Chrome",
  res: "1080p", play: "transcode", bitrate: "8.0", codec: "H264", pos: 0.5, dur: 148, paused: false,
  art: "/api/artwork?x", backdrop: "/api/artwork?b", summary: "A heist.", genres: ["Sci-Fi"], userAvatar: undefined,
  platform: "Chrome", product: "Plex Web", devicePlatform: "Windows", qualityProfile: "Original",
  location: "wan", ipPublic: "1.2.3.4", secure: true, relayed: false, local: false, sessionKbps: 8000,
  geo: { city: "Berlin", region: "BE", country: "Germany", code: "DE", lat: 52, lon: 13 },
  videoDecision: "transcode", audioDecision: "copy", subtitleDecision: "burn", hwTranscode: true,
  transcodeThrottled: false, transcodeSpeed: 1.8, transcodeProgress: 50, dynamicRange: "SDR", framerate: "24p",
  sourceContainer: "mkv", streamContainer: "mp4", sourceKbps: 12000, streamCodec: "h264", audioCodec: "dts",
  streamAudioCodec: "aac", audioChannels: 6, streamAudioChannels: 2, audioLayout: "5.1",
  subtitle: { codec: "srt", language: "en", transcode: true },
};

beforeEach(() => {
  vi.mocked(useData).mockReturnValue({ nowPlaying: [session], services: [], users: [{ id: "u1", name: "Ada" }], bandwidth: { totalMbps: 8, wanMbps: 8 } } as never);
});

describe("now-playing detail rendering", () => {
  it("NowPlayingPanel renders a populated stream row", () => {
    const { container } = render(<NowPlayingPanel role="admin" fill />);
    expect(container.textContent).toContain("Inception");
  });

  it("Streams view renders the session card with tech detail", () => {
    const { container } = render(<Streams />);
    expect(container.textContent).toContain("Inception");
  });

  it("Streams page body opts into the wide content tier (#101)", () => {
    const { container } = render(<Streams />);
    expect(container.querySelector(".aerie-page-pad.aerie-page-pad--wide")).not.toBeNull();
  });

  it("lays live session cards in a multi-column grid so they sit side by side (#101)", () => {
    // Two concurrent sessions should be placed in a single grid track row, not a
    // stacked flex column — that's what lets them sit side by side on wide screens.
    const second = { ...session, id: "s2", title: "Arrival" };
    vi.mocked(useData).mockReturnValue({ nowPlaying: [session, second], services: [], users: [], bandwidth: null } as never);
    const { container } = render(<StreamsView role="admin" />);
    const grid = Array.from(container.querySelectorAll<HTMLElement>("div")).find(
      (el) => el.style.display === "grid" && el.style.gridTemplateColumns.includes("auto-fit"),
    );
    expect(grid).toBeDefined();
    // Both sessions render as direct grid children (cards), centered.
    expect(grid!.style.justifyContent).toBe("center");
    expect(grid!.children.length).toBe(2);
    expect(container.textContent).toContain("Inception");
    expect(container.textContent).toContain("Arrival");
  });
});
