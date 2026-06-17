import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

import {
  DataProvider,
  useData,
  useRefresh,
  usePatchData,
  useSnapshotTime,
} from "@/components/portal/DataProvider";
import type { Snapshot } from "@/lib/data/snapshot";

// ---- fixtures -------------------------------------------------------------
function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    services: [
      { id: "radarr", active: true, name: "Radarr" },
      { id: "old", active: false, name: "Old" },
    ],
    nowPlaying: [],
    requests: [],
    ...over,
  } as unknown as Snapshot;
}

const POLL_IDLE = 12_000;
const POLL_ACTIVE = 3_000;

// ---- probe ----------------------------------------------------------------
function Probe() {
  const data = useData();
  const refresh = useRefresh();
  const patch = usePatchData();
  const fetchedAt = useSnapshotTime();
  return (
    <div>
      <span data-testid="np">{data.nowPlaying.length}</span>
      <span data-testid="svc-ids">{data.services.map((s) => s.id).join(",")}</span>
      <span data-testid="all-ids">{data.allServices.map((s) => s.id).join(",")}</span>
      <span data-testid="req">{data.requests.length}</span>
      <span data-testid="fetchedAt">{fetchedAt}</span>
      <button onClick={() => void refresh()}>refresh</button>
      <button
        onClick={() =>
          patch((s) => ({ ...s, requests: [{ id: "r1" }] as unknown as Snapshot["requests"] }))
        }
      >
        patch
      </button>
    </div>
  );
}

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  fetchMock = vi.fn(async () => jsonRes(snap()));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DataProvider", () => {
  it("seeds from the initial snapshot and exposes active-only services + allServices", () => {
    render(
      <DataProvider initial={snap()}>
        <Probe />
      </DataProvider>
    );
    // services narrowed to active-only
    expect(screen.getByTestId("svc-ids").textContent).toBe("radarr");
    // allServices keeps the inactive row too
    expect(screen.getByTestId("all-ids").textContent).toBe("radarr,old");
  });

  it("polls /api/snapshot and updates data on the idle (12s) interval when no stream is active", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(snap({ nowPlaying: [{ id: "p1" }] as never })));
    render(
      <DataProvider initial={snap()}>
        <Probe />
      </DataProvider>
    );
    expect(fetchMock).not.toHaveBeenCalled();

    // Just before the idle interval: no fetch yet (proves it isn't the 3s active one).
    await act(async () => {
      vi.advanceTimersByTime(POLL_ACTIVE);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // At the idle interval: it fetches.
    await act(async () => {
      vi.advanceTimersByTime(POLL_IDLE - POLL_ACTIVE);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/snapshot");
    // flush the resolved fetch + setState
    await act(async () => {});
    expect(screen.getByTestId("np").textContent).toBe("1");
  });

  it("uses the fast (3s) active interval once a stream is playing", async () => {
    render(
      <DataProvider initial={snap({ nowPlaying: [{ id: "p1" }] as never })}>
        <Probe />
      </DataProvider>
    );
    await act(async () => {
      vi.advanceTimersByTime(POLL_ACTIVE);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pauses polling while the tab is hidden", async () => {
    hidden = true;
    render(
      <DataProvider initial={snap()}>
        <Probe />
      </DataProvider>
    );
    await act(async () => {
      vi.advanceTimersByTime(POLL_IDLE * 2);
    });
    // timer fired but document.hidden short-circuits the fetch
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-fetches immediately when the tab becomes visible", async () => {
    render(
      <DataProvider initial={snap()}>
        <Probe />
      </DataProvider>
    );
    await act(async () => {
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not fetch on visibilitychange while still hidden", async () => {
    render(
      <DataProvider initial={snap()}>
        <Probe />
      </DataProvider>
    );
    await act(async () => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("useRefresh forces an immediate refetch and updates the snapshot + fetchedAt", async () => {
    fetchMock.mockResolvedValue(jsonRes(snap({ nowPlaying: [{ id: "x" }] as never })));
    render(
      <DataProvider initial={snap()}>
        <Probe />
      </DataProvider>
    );
    const before = screen.getByTestId("fetchedAt").textContent;
    // advance the (faked) wall clock so the new fetchedAt timestamp differs
    await act(async () => {
      vi.setSystemTime(Date.now() + 5_000);
      screen.getByText("refresh").click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/snapshot");
    await act(async () => {});
    expect(screen.getByTestId("np").textContent).toBe("1");
    expect(screen.getByTestId("fetchedAt").textContent).not.toBe(before);
  });

  it("fetches immediately on mount when initialStale is true", async () => {
    render(
      <DataProvider initial={snap()} initialStale>
        <Probe />
      </DataProvider>
    );
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("usePatchData optimistically mutates the snapshot without a network call", async () => {
    render(
      <DataProvider initial={snap()}>
        <Probe />
      </DataProvider>
    );
    expect(screen.getByTestId("req").textContent).toBe("0");
    await act(async () => {
      screen.getByText("patch").click();
    });
    expect(screen.getByTestId("req").textContent).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the last-good requests when a poll returns an empty requests array", async () => {
    // seed with one request, then a poll comes back with zero requests
    fetchMock.mockResolvedValue(jsonRes(snap({ requests: [] })));
    render(
      <DataProvider initial={snap({ requests: [{ id: "keep" }] as never })}>
        <Probe />
      </DataProvider>
    );
    expect(screen.getByTestId("req").textContent).toBe("1");
    await act(async () => {
      screen.getByText("refresh").click();
    });
    // empty requests in the response are ignored — the last-known list is preserved
    await act(async () => {});
    expect(screen.getByTestId("req").textContent).toBe("1");
  });

  it("keeps the last-good snapshot on a failed (non-ok) response", async () => {
    fetchMock.mockResolvedValue(jsonRes(null, false));
    render(
      <DataProvider initial={snap({ nowPlaying: [{ id: "stay" }] as never })}>
        <Probe />
      </DataProvider>
    );
    await act(async () => {
      screen.getByText("refresh").click();
    });
    await act(async () => {});
    // data unchanged after a failed fetch
    expect(screen.getByTestId("np").textContent).toBe("1");
  });

  it("keeps the last-good snapshot when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    render(
      <DataProvider initial={snap({ nowPlaying: [{ id: "stay" }] as never })}>
        <Probe />
      </DataProvider>
    );
    await act(async () => {
      screen.getByText("refresh").click();
    });
    await act(async () => {});
    expect(screen.getByTestId("np").textContent).toBe("1");
  });

  it("throws when useData is used outside a DataProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Bare() {
      useData();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/useData must be used within/);
    spy.mockRestore();
  });
});
