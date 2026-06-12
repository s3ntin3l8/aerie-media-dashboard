import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEmbedProbe, EMBED_LOAD_TIMEOUT_MS } from "@/components/hooks/useEmbedProbe";

const svc = { id: "radarr", embeddable: true };

describe("useEmbedProbe — reload + reloadKey", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts in checking, soft-fails to unverified after the timeout", () => {
    const { result } = renderHook(() => useEmbedProbe(svc));
    expect(result.current.embedState).toBe("checking");
    act(() => void vi.advanceTimersByTime(EMBED_LOAD_TIMEOUT_MS));
    expect(result.current.embedState).toBe("unverified");
  });

  it("reload() resets to checking, bumps reloadKey, and restarts the timeout", () => {
    const { result } = renderHook(() => useEmbedProbe(svc));
    act(() => void vi.advanceTimersByTime(EMBED_LOAD_TIMEOUT_MS));
    expect(result.current.embedState).toBe("unverified");
    const key0 = result.current.reloadKey;

    act(() => result.current.reload());
    expect(result.current.embedState).toBe("checking");
    expect(result.current.reloadKey).toBe(key0 + 1);

    // The 12s race restarts — it must time out again, not be already-fired.
    act(() => void vi.advanceTimersByTime(EMBED_LOAD_TIMEOUT_MS - 1));
    expect(result.current.embedState).toBe("checking");
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.embedState).toBe("unverified");
  });

  it("onLoad after reload wins the new race → ok", () => {
    const { result } = renderHook(() => useEmbedProbe(svc));
    act(() => void vi.advanceTimersByTime(EMBED_LOAD_TIMEOUT_MS));
    act(() => result.current.reload());
    act(() => result.current.onLoad());
    expect(result.current.embedState).toBe("ok");
    // A late timeout from the prior race must not flip an already-loaded frame.
    act(() => void vi.advanceTimersByTime(EMBED_LOAD_TIMEOUT_MS));
    expect(result.current.embedState).toBe("ok");
  });

  it("reloadKey is monotonically increasing across reloads", () => {
    const { result } = renderHook(() => useEmbedProbe(svc));
    const k0 = result.current.reloadKey;
    act(() => result.current.reload());
    act(() => result.current.reload());
    expect(result.current.reloadKey).toBe(k0 + 2);
  });
});
