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
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/data/snapshot";

const POLL_ACTIVE_MS = 3_000;
const POLL_IDLE_MS = 12_000;

const DataCtx = createContext<Snapshot | null>(null);
const RefreshCtx = createContext<() => void>(() => {});
/** Epoch-ms timestamp of the most-recent successful snapshot fetch. */
const FetchedAtCtx = createContext<number>(Date.now());

export function useData(): Snapshot {
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

export function DataProvider({ initial, children }: { initial: Snapshot; children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot>(initial);
  const [fetchedAt, setFetchedAt] = useState<number>(() => Date.now());

  // Stable refs so callbacks never go stale without re-creating intervals
  const dataRef = useRef<Snapshot>(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // fetchRef breaks the scheduleNext ↔ fetchSnapshot circular dependency
  const fetchRef = useRef<() => Promise<void>>(async () => {});

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
      dataRef.current = merged;
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
    scheduleNext(dataRef.current);

    const onVisible = () => {
      if (!document.hidden) void fetchSnapshot();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, [fetchSnapshot, scheduleNext]);

  return (
    <FetchedAtCtx.Provider value={fetchedAt}>
      <RefreshCtx.Provider value={fetchSnapshot}>
        <DataCtx.Provider value={data}>{children}</DataCtx.Provider>
      </RefreshCtx.Provider>
    </FetchedAtCtx.Provider>
  );
}
