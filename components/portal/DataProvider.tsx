"use client";
// ============================================================
// AERIE — client data provider
// Seeded by a server-rendered Snapshot, then polls /api/snapshot
// so now-playing / status stay live without a full navigation.
// ============================================================
import React, { createContext, useContext, useEffect, useState } from "react";
import type { Snapshot } from "@/lib/data/snapshot";

const Ctx = createContext<Snapshot | null>(null);

export function useData(): Snapshot {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData must be used within <DataProvider>");
  return v;
}

export function DataProvider({ initial, pollMs = 12000, children }: { initial: Snapshot; pollMs?: number; children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot>(initial);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Snapshot;
        if (alive) setData(next);
      } catch {
        /* keep last good snapshot */
      }
    };
    const t = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}
