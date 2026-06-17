// ============================================================
// AERIE — Plex admin maintenance actions (server-only)
// Plex is monitor-only elsewhere (only the unauthenticated /identity version probe). These
// reads/actions need the *server owner's* X-Plex-Token (stored as the plex apiKey secret) and
// power the admin-only Plex Maintenance panel. Plex defaults to XML; Accept: application/json
// flips it to JSON. Actions are fire-and-forget (200 + empty body, async) — there is no
// completion signal, so the panel re-reads section `refreshing` / butler state to show progress.
// ============================================================
import "server-only";
import { IntegrationError } from "../http";
import { serviceClient } from "../serviceClient";
import { cached, bustCache } from "./cache";

export interface PlexSection {
  id: string;
  title: string;
  type: string;
  agent: string;
  refreshing: boolean;
  /** Last scan time, epoch seconds (Plex `scannedAt`, falling back to `updatedAt`). Absent → never reported. */
  scannedAt?: number;
}
export interface PlexButlerTask {
  name: string;
  title: string;
  description: string;
  enabled: boolean;
  interval: number;
}

const plexHeaders = (apiKey: string) => ({ "X-Plex-Token": apiKey, Accept: "application/json" });

interface PlexSectionsRaw {
  MediaContainer?: { Directory?: { key: string; type?: string; title?: string; agent?: string; refreshing?: boolean; scannedAt?: number; updatedAt?: number }[] };
}
interface PlexButlerRaw {
  ButlerTasks?: { ButlerTask?: { name: string; title?: string; description?: string; enabled?: boolean; interval?: number }[] };
}

/** List the Plex server's libraries (cached briefly so panel re-opens / post-action re-reads coalesce). */
export function plexSections(): Promise<PlexSection[]> {
  return cached("plex:sections", 10_000, async () => {
    const { apiKey, json } = await serviceClient("plex");
    const d = await json<PlexSectionsRaw>("/library/sections/", { service: "plex", headers: plexHeaders(apiKey) });
    return (d.MediaContainer?.Directory ?? []).map((s) => ({
      id: s.key,
      title: s.title ?? s.key,
      type: s.type ?? "",
      agent: s.agent ?? "",
      refreshing: Boolean(s.refreshing),
      scannedAt: s.scannedAt ?? s.updatedAt,
    }));
  });
}

/** List the Plex butler (scheduled-maintenance) tasks. Intro/credit marker tasks only appear here
 *  when the server has Plex Pass — never hardcode names, surface whatever the server returns. */
export function plexButlerTasks(): Promise<PlexButlerTask[]> {
  return cached("plex:butler", 10_000, async () => {
    const { apiKey, json } = await serviceClient("plex");
    const d = await json<PlexButlerRaw>("/butler", { service: "plex", headers: plexHeaders(apiKey) });
    return (d.ButlerTasks?.ButlerTask ?? []).map((t) => ({
      name: t.name,
      title: t.title ?? t.name,
      description: t.description ?? "",
      enabled: Boolean(t.enabled),
      interval: t.interval ?? 0,
    }));
  });
}

/** Send a fire-and-forget Plex action and assert a 2xx (the body is empty, so don't parse it). */
async function plexAction(path: string, method: string): Promise<void> {
  const { apiKey, raw } = await serviceClient("plex");
  const res = await raw(path, { service: "plex", method, headers: plexHeaders(apiKey) });
  if (!res.ok) throw new IntegrationError("plex", `HTTP ${res.status} for ${method} ${path}`, res.status);
  bustCache("plex:sections");
  bustCache("plex:butler");
}

/** Scan a library for new/removed files; `force` re-fetches metadata for every item (refresh). */
export const plexScanSection = (id: string, force = false): Promise<void> =>
  plexAction(`/library/sections/${encodeURIComponent(id)}/refresh${force ? "?force=1" : ""}`, "GET");

/** Re-analyze a library's media (media-info, markers where supported). */
export const plexAnalyzeSection = (id: string): Promise<void> =>
  plexAction(`/library/sections/${encodeURIComponent(id)}/analyze`, "PUT");

/** Empty a library's trash, or every library's trash when no id is given. */
export async function plexEmptyTrash(id?: string): Promise<void> {
  if (id) return plexAction(`/library/sections/${encodeURIComponent(id)}/emptyTrash`, "PUT");
  const sections = await plexSections();
  for (const s of sections) await plexAction(`/library/sections/${encodeURIComponent(s.id)}/emptyTrash`, "PUT");
}

export const plexCleanBundles = (): Promise<void> => plexAction("/library/clean/bundles?async=1", "PUT");
export const plexOptimizeDb = (): Promise<void> => plexAction("/library/optimize?async=1", "PUT");

/** Run a butler task now (validate the name against `plexButlerTasks()` upstream). */
export const plexRunButlerTask = (name: string): Promise<void> =>
  plexAction(`/butler/${encodeURIComponent(name)}`, "POST");