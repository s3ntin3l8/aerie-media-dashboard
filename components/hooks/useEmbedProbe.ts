"use client";
// ============================================================
// AERIE — useEmbedProbe
// ------------------------------------------------------------
// Extracted from ServiceView (components/views/Launcher.tsx).
// Drives the iframe load-state / timeout logic so both the
// desktop ServiceView and the mobile MobileServiceView can use
// the same probe without duplicating the timing constants.
//
// How it works:
// • Resets state on every service change (s.id / s.embeddable).
// • For embeddable services, starts a EMBED_LOAD_TIMEOUT_MS timer.
//   If the iframe fires `onLoad` before the timer, state = "ok".
//   If the timer fires first, state = "unverified" (soft warning —
//   could be a slow service, not necessarily a hard frame block).
// • Non-embeddable services immediately stay "checking" (unused,
//   but callers won't render the iframe anyway).
// ============================================================
import { useCallback, useEffect, useState } from "react";
import type { Service } from "@/lib/types";

export type EmbedState = "checking" | "ok" | "unverified";

/** How long to wait for the iframe `load` event before soft-failing. */
export const EMBED_LOAD_TIMEOUT_MS = 12_000;

export const EMBED_BADGE: Record<EmbedState, { label: string; color: string }> = {
  checking: { label: "CHECKING…", color: "var(--on-surface-variant)" },
  ok: { label: "FRAME-ANCESTORS OK", color: "var(--originator-own)" },
  unverified: { label: "EMBED UNVERIFIED", color: "var(--amber)" },
};

export interface EmbedProbe {
  embedState: EmbedState;
  badge: { label: string; color: string };
  /** Pass to `<iframe onLoad>`. */
  onLoad: () => void;
  /** Pass to `<iframe onError>`. */
  onError: () => void;
  /** Reset the probe and force a fresh load attempt (restarts the timeout). */
  reload: () => void;
  /** Monotonic nonce — use as the iframe React `key` so `reload()` remounts the frame. */
  reloadKey: number;
}

export function useEmbedProbe(s: Pick<Service, "id" | "embeddable">): EmbedProbe {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // Bumped by reload(); used both to re-run the timeout effect and (by callers) as the
  // iframe `key`. Re-assigning the same src doesn't reload a frame — only a remount does.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    if (!s.embeddable) return;
    let alive = true;
    const t = setTimeout(() => {
      if (alive) setTimedOut(true);
    }, EMBED_LOAD_TIMEOUT_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [s.id, s.embeddable, reloadKey]);

  const reload = useCallback(() => {
    setLoaded(false);
    setTimedOut(false);
    setReloadKey((k) => k + 1);
  }, []);

  const embedState: EmbedState = loaded ? "ok" : timedOut ? "unverified" : "checking";
  return {
    embedState,
    badge: EMBED_BADGE[embedState],
    onLoad: () => setLoaded(true),
    onError: () => setTimedOut(true),
    reload,
    reloadKey,
  };
}
