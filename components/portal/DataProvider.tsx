"use client";
// ============================================================
// AERIE — client data provider
// Seeded by a server-rendered Snapshot, then polls /api/snapshot
// so now-playing / status stay live without a full navigation.
// `useRefresh()` lets mutations (admin modals) pull fresh data now.
// ============================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Snapshot } from "@/lib/data/snapshot";

const DataCtx = createContext<Snapshot | null>(null);
const RefreshCtx = createContext<() => void>(() => {});

export function useData(): Snapshot {
  const v = useContext(DataCtx);
  if (!v) throw new Error("useData must be used within <DataProvider>");
  return v;
}

/** Force an immediate snapshot refetch (after a mutation). */
export function useRefresh(): () => void {
  return useContext(RefreshCtx);
}

export function DataProvider({ initial, pollMs = 12000, children }: { initial: Snapshot; pollMs?: number; children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot>(initial);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshot", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as Snapshot;
      // If Overseerr degraded to empty (timeout, cold enrichment cache, etc.)
      // keep the previous requests rather than flashing an empty state.
      // Trade-off: a genuine drop to 0 requests shows stale data for one extra poll.
      setData((prev) =>
        next.requests.length === 0 && prev.requests.length > 0
          ? { ...next, requests: prev.requests }
          : next,
      );
    } catch {
      /* keep last good snapshot */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!document.hidden && alive) void fetchSnapshot();
    };
    const t = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs, fetchSnapshot]);

  return (
    <RefreshCtx.Provider value={fetchSnapshot}>
      <DataCtx.Provider value={data}>{children}</DataCtx.Provider>
    </RefreshCtx.Provider>
  );
}
