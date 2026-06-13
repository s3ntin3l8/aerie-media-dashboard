import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { NowPlaying } from "@/lib/types";

// The chip reuses useStreamProgress (which needs DataProvider context) — stub it to a fixed
// percentage so the chip can render in isolation. Router is stubbed to assert navigation.
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/hooks/useStreamProgress", () => ({ useStreamProgress: () => ({ cur: 600, pct: 42 }) }));

import { NowPlayingChip } from "@/components/views/NowPlayingChip";

const sess = (over: Partial<NowPlaying> = {}): NowPlaying => ({
  id: "s1", title: "Inception", kind: "movie", user: "ada", src: "plex", device: "Living Room",
  res: "1080p", play: "direct", bitrate: "8", codec: "h264", pos: 0.4, dur: 148, paused: false,
  art: "/api/artwork?svc=tautulli&ref=x", ...over,
}) as NowPlaying;

beforeEach(() => vi.clearAllMocks());

describe("NowPlayingChip", () => {
  it("renders the title and a play icon for an active session", () => {
    render(<NowPlayingChip sessions={[sess()]} accent="var(--primary)" />);
    expect(screen.getByText("Inception")).toBeInTheDocument();
    expect(screen.getByText("play_arrow")).toBeInTheDocument();
  });

  it("shows a pause icon when the session is paused", () => {
    render(<NowPlayingChip sessions={[sess({ paused: true })]} accent="var(--primary)" />);
    expect(screen.getByText("pause")).toBeInTheDocument();
  });

  it("summarises extra concurrent sessions as +N", () => {
    render(<NowPlayingChip sessions={[sess(), sess({ id: "s2", title: "Dune" }), sess({ id: "s3", title: "Arrival" })]} accent="var(--primary)" />);
    expect(screen.getByText("Inception +2")).toBeInTheDocument();
  });

  it("navigates to /streams on click", () => {
    render(<NowPlayingChip sessions={[sess()]} accent="var(--primary)" />);
    fireEvent.click(screen.getByRole("button"));
    expect(push).toHaveBeenCalledWith("/streams");
  });
});
