// ============================================================
// AERIE — keep-alive indicator derivation (pure, client-safe)
// ------------------------------------------------------------
// Derives the visual state for the keep-alive flag surfaced on the rail,
// /services cards and the /status health rows. Two sub-states:
//   - flagged: admin toggled `keepAlive` on, but its iframe isn't mounted yet
//   - live:    its iframe is currently kept alive in EmbedHost (id in keptAliveIds)
// Pure so it's unit-testable in isolation (mirrors embedAuth.ts).
// ============================================================
import type { Service } from "@/lib/types";

export interface KeepAliveDisplay {
  /** whether to render an indicator at all (embeddable + keep-alive flag set) */
  show: boolean;
  /** true when the embed is mounted/persisting right now */
  live: boolean;
  /** icon colour: accent when live, muted when merely flagged */
  color: string;
  /** tooltip copy describing the current state */
  title: string;
}

export function keepAliveDisplay(service: Service, live: boolean): KeepAliveDisplay {
  const show = Boolean(service.embeddable && service.keepAlive);
  return {
    show,
    live: show && live,
    color: show && live ? "var(--primary)" : "var(--on-surface-variant)",
    title: !show
      ? ""
      : live
        ? "Keep-alive — running in the background now"
        : "Keep-alive on — persists in the background once opened",
  };
}
