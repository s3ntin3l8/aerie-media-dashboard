"use client";
// ============================================================
// AERIE — client data provider
// Seeded by a server-rendered Snapshot, then polls /api/snapshot
// so now-playing / status stay live without a full navigation.
// `useRefresh()` lets mutations (admin modals) pull fresh data now.
//
// Adaptive polling: 3 s while streams are active (fast pause/resume
// detection), 12 s when idle. `fetchedAt` is stamped on every
// successful fetch so progress bars can interpolate from a known
// server-confirmed position rather than from component mount time.
// ============================================================
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "@/lib/data/snapshot";
import type { Service } from "@/lib/types";

const POLL_ACTIVE_MS = 3_000;
const POLL_IDLE_MS = 12_000;

/**
 * What `useData()` exposes: the snapshot with `services` narrowed to **active-only**
 * (inactive services are fully disabled — hidden from every consumer) plus `allServices`,
 * the full list including inactive rows, which only the Admin management surfaces read.
 * Filtering here is the single chokepoint that enforces "fully disable" uniformly.
 */
export type ClientData = Snapshot & { allServices: Service[] };

const DataCtx = createContext<ClientData | null>(null);
const RefreshCtx = createContext<() => void>(() => {});
const PatchCtx = createContext<(patch: (s: Snapshot) => Snapshot) => void>(() => {});
/** Epoch-ms timestamp of the most-recent successful snapshot fetch. */
const FetchedAtCtx = createContext<number>(Date.now());

export function useData(): ClientData {
  const v = useContext(DataCtx);
  if (!v) throw new Error("useData must be used within <DataProvider>");
  return v;
}

/** Returns the epoch-ms timestamp when the current snapshot was fetched.
 *  Use this as the time-base for progress interpolation instead of
 *  component mount time, so each new poll resets the drift clock. */
export function useSnapshotTime(): number {
  return useContext(FetchedAtCtx);
}

/** Force an immediate snapshot refetch (after a mutation). */
export function useRefresh(): () => void {
  return useContext(RefreshCtx);
}

/** Optimistically update the local snapshot without a network round-trip. */
export function usePatchData(): (patch: (s: Snapshot) => Snapshot) => void {
  return useContext(PatchCtx);
}

export function DataProvider({ initial, initialStale = false, children }: { initial: Snapshot; initialStale?: boolean; children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot>(initial);
  const [fetchedAt, setFetchedAt] = useState<number>(() => Date.now());

  // Stable refs so callbacks never go stale without re-creating intervals
  const dataRef = useRef<Snapshot>(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // fetchRef breaks the scheduleNext ↔ fetchSnapshot circular dependency
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  // Keep dataRef in sync with state so timer callbacks always see the latest snapshot.
  // useLayoutEffect fires synchronously before any timer callback can read stale data.
  useLayoutEffect(() => {
    dataRef.current = data;
  });

  const patchData = useCallback((patch: (s: Snapshot) => Snapshot) => {
    setData((prev) => patch(prev));
  }, []);

  const scheduleNext = useCallback((snapshot: Snapshot) => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    const delay = snapshot.nowPlaying.length > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    timerRef.current = setTimeout(() => {
      if (!document.hidden) void fetchRef.current();
    }, delay);
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshot", { cache: "no-store" });
      if (!res.ok) { scheduleNext(dataRef.current); return; }
      const next = (await res.json()) as Snapshot;
      const merged =
        next.requests.length === 0 && dataRef.current.requests.length > 0
          ? { ...next, requests: dataRef.current.requests }
          : next;
      setData(merged);
      setFetchedAt(Date.now());
      scheduleNext(merged);
    } catch {
      /* keep last good snapshot, retry on next schedule */
      scheduleNext(dataRef.current);
    }
  }, [scheduleNext]);

  // Keep fetchRef current so scheduleNext's setTimeout always calls the latest version.
  // useLayoutEffect runs synchronously after render, before any timers fire.
  useLayoutEffect(() => {
    fetchRef.current = fetchSnapshot;
  });

  // Kick off polling and re-fetch immediately when tab becomes visible
  useEffect(() => {
    // The server served a stale/last-known snapshot (a fresh one would have blocked the
    // shell on a cold upstream). Pull fresh data right away instead of waiting a full poll.
    if (initialStale) void fetchSnapshot();
    scheduleNext(dataRef.current);

    const onVisible = () => {
      if (!document.hidden) void fetchSnapshot();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, [fetchSnapshot, scheduleNext, initialStale]);

  // Single chokepoint: `services` is narrowed to active-only for every consumer, while
  // `allServices` keeps the full list (incl. inactive) for the Admin management surfaces.
  // The internal `data` state stays full, so polling + patchData are unaffected.
  const clientData = useMemo<ClientData>(() => ({
    ...data,
    allServices: data.services,
    services: data.services.filter((s) => s.active),
  }), [data]);

  return (
    <FetchedAtCtx.Provider value={fetchedAt}>
      <RefreshCtx.Provider value={fetchSnapshot}>
        <PatchCtx.Provider value={patchData}>
          <DataCtx.Provider value={clientData}>{children}</DataCtx.Provider>
        </PatchCtx.Provider>
      </RefreshCtx.Provider>
    </FetchedAtCtx.Provider>
  );
}
