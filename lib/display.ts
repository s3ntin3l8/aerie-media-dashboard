// ============================================================
// AERIE — pure display constants and mappers
// ------------------------------------------------------------
// These used to live in components/panels.tsx (a heavy "use client"
// module). Extracted here so mobile screens and any future
// component can import them without pulling in the full panel
// graph (DataProvider, PortalProvider, ServiceLogo, etc.).
// ============================================================
import type { Service, ServiceStatus } from "@/lib/types";

// ── Service health ──────────────────────────────────────────

function assertNever(x: never): never {
  throw new Error(`Unhandled ServiceStatus: ${String(x)}`);
}

/** CSS custom-property for a service status (green / amber / red / dim). */
export function statusColor(st: ServiceStatus): string {
  switch (st) {
    case "up":
      return "var(--originator-own)";
    case "degraded":
      return "var(--amber)";
    case "down":
      return "var(--error)";
    case "unknown":
      return "var(--on-surface-variant)";
    default:
      return assertNever(st);
  }
}

/** Short uppercased label for a service status. */
export function statusWord(st: ServiceStatus): string {
  switch (st) {
    case "up":
      return "OPERATIONAL";
    case "degraded":
      return "DEGRADED";
    case "down":
      return "DOWN";
    case "unknown":
      return "NO DATA";
    default:
      return assertNever(st);
  }
}

/** Short uptime label — honest "—" when health is unknown. */
export function uptimeText(s: Pick<Service, "status" | "uptime">): string {
  return s.status === "unknown" ? "—" : `${s.uptime.toFixed(2)}%`;
}

// ── Media request status ────────────────────────────────────

/** Pill tone token name per request status (e.g. "amber", "originator-own"). */
export const REQ_TONE: Record<string, string> = {
  available: "originator-own",
  approved: "originator-court",
  pending: "amber",
  declined: "error",
  processing: "primary",
  failed: "error",
};

/** Display label per request status. */
export const REQ_LABEL: Record<string, string> = {
  available: "Available",
  approved: "Approved",
  pending: "Pending",
  declined: "Declined",
  processing: "Processing",
  failed: "Failed",
};
