import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useIsMobile } from "@/components/mobile/useIsMobile";

type ChangeListener = (e: MediaQueryListEvent) => void;

/** Build a controllable matchMedia stub. Returns helpers to flip the match
 *  state and to dispatch a `change` event to registered listeners. */
function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<ChangeListener>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "(max-width: 768px)",
    addEventListener: (_type: string, cb: ChangeListener) => listeners.add(cb),
    removeEventListener: (_type: string, cb: ChangeListener) => listeners.delete(cb),
  };
  const matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
  window.matchMedia = matchMedia;
  return {
    matchMedia,
    listeners,
    setMatches: (v: boolean) => {
      matches = v;
    },
    emitChange: (v: boolean) => {
      matches = v;
      listeners.forEach((cb) => cb({ matches: v } as MediaQueryListEvent));
    },
  };
}

describe("useIsMobile", () => {
  let original: typeof window.matchMedia;
  beforeEach(() => {
    original = window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
    vi.restoreAllMocks();
  });

  it("reports true on a narrow (mobile) viewport after mount", () => {
    const mm = installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    expect(mm.matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
  });

  it("reports false on a wide (desktop) viewport", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("reacts to a media-query change event", () => {
    const mm = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => mm.emitChange(true));
    expect(result.current).toBe(true);
    act(() => mm.emitChange(false));
    expect(result.current).toBe(false);
  });

  it("removes its change listener on unmount", () => {
    const mm = installMatchMedia(true);
    const { unmount } = renderHook(() => useIsMobile());
    expect(mm.listeners.size).toBe(1);
    unmount();
    expect(mm.listeners.size).toBe(0);
  });
});
