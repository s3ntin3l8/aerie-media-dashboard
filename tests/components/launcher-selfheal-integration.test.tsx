import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import React from "react";

// Integration: the REAL useEmbedProbe drives the REAL ServiceView. This verifies the full
// self-heal chain (timeout → fallback → focus → reloadKey bump → iframe remount → back to
// checking) that the mock-based tests can't — effect deps, the iframe `key` binding, and the
// state transitions are all live here.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({
    paletteOpen: false, modalOpen: false, favorites: [], toggleFavorite: vi.fn(),
    user: { name: "tester", email: "t@e" }, oidc: true,
  }),
}));
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
// ServiceView reads now-playing for the header chip; stub the snapshot context.
vi.mock("@/components/portal/DataProvider", () => ({ useData: () => ({ nowPlaying: [] }) }));

import { ServiceView } from "@/components/views/Launcher";
import { EMBED_LOAD_TIMEOUT_MS } from "@/components/hooks/useEmbedProbe";

const svc = {
  id: "radarr", name: "Radarr", cat: "automation", icon: "dns",
  host: "radarr.test", scheme: "https", embeddable: true, active: true,
  keepAlive: true, version: "1", status: "up", uptime: 100, ms: 1, beats: [], note: "",
} as never;

const iframe = () => document.querySelector("iframe");
const failTimer = () => act(() => void vi.advanceTimersByTime(EMBED_LOAD_TIMEOUT_MS));

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});
afterEach(() => vi.useRealTimers());

describe("ServiceView self-heal — real probe integration", () => {
  it("times out to the fallback, then a tab-return remounts the iframe and returns to checking", () => {
    render(<ServiceView s={svc} />);
    // Initially checking (spinner), iframe present but invisible.
    expect(screen.getByText(/loading embedded session/i)).toBeInTheDocument();
    const first = iframe();
    expect(first).toBeTruthy();

    // 12s with no onLoad → soft-fail to the re-auth panel.
    failTimer();
    expect(screen.getByText(/session may have expired/i)).toBeInTheDocument();

    // Tab return while failed → reload(): iframe is a *new* DOM node (key bump = fresh navigation)
    // and we're back in checking.
    act(() => void fireEvent(window, new Event("focus")));
    expect(iframe()).not.toBe(first);
    expect(screen.getByText(/loading embedded session/i)).toBeInTheDocument();
    expect(screen.queryByText(/session may have expired/i)).toBeNull();
  });

  it("keeps retrying: every tab-return while still failed remounts the frame again", () => {
    render(<ServiceView s={svc} />);
    failTimer();
    const a = iframe();
    act(() => void fireEvent(window, new Event("focus"))); // 1st self-heal
    const b = iframe();
    expect(b).not.toBe(a);

    failTimer(); // the retry also fails after 12s
    expect(screen.getByText(/session may have expired/i)).toBeInTheDocument();
    act(() => void fireEvent(window, new Event("focus"))); // 2nd self-heal
    expect(iframe()).not.toBe(b);
  });

  it("does NOT remount a healthy (loaded) embed on tab-return — keep-alive state preserved", () => {
    render(<ServiceView s={svc} />);
    const node = iframe();
    act(() => void fireEvent.load(node!)); // onLoad → ok
    expect(screen.queryByText(/loading embedded session/i)).toBeNull();

    act(() => void fireEvent(window, new Event("focus")));
    act(() => void fireEvent(document, new Event("visibilitychange")));
    expect(iframe()).toBe(node); // same node → no reload, no state loss
  });

  it("Retry button remounts the frame and returns to checking", () => {
    render(<ServiceView s={svc} />);
    failTimer();
    const before = iframe();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(iframe()).not.toBe(before);
    expect(screen.getByText(/loading embedded session/i)).toBeInTheDocument();
  });
});
