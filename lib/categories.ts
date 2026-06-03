// ============================================================
// AERIE — static UI taxonomy & request-form config
// (Relocated verbatim from the removed lib/mock/data.ts. Not mock
// data — these are design constants used across client + server.)
// ============================================================
import type { Category, CatMeta, QualityProfile } from "@/lib/types";

// Service-category accent system (reframed originator palette).
export const CAT: Record<Category, CatMeta> = {
  stream: { token: "var(--primary)", label: "Streaming" },
  request: { token: "var(--originator-court)", label: "Requests" },
  automation: { token: "var(--originator-third-party)", label: "Automation" },
  monitor: { token: "var(--originator-own)", label: "Monitoring" },
  infra: { token: "var(--originator-unknown)", label: "Infra" },
};

export function catColor(cat: Category): string {
  return (CAT[cat] || CAT.infra).token;
}

/** Canonical display order for service categories. */
export const CAT_ORDER: Category[] = ["stream", "request", "automation", "monitor", "infra"];

// Request quality profiles (request modal). A future enhancement could
// fetch real per-instance profiles from Overseerr/the *arr APIs.
export const QUALITY_PROFILES: QualityProfile[] = [
  { id: "hd1080", label: "1080p", sub: "HD · Bluray/WEB", icon: "hd", def: true },
  { id: "uhd4k", label: "4K HDR", sub: "2160p · Dolby Vision", icon: "4k" },
  { id: "any", label: "Any", sub: "First available", icon: "auto_awesome" },
];
