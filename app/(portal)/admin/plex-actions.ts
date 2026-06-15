"use server";
// ============================================================
// AERIE — Plex maintenance actions (server actions). Admin-guarded.
// Reads (libraries + butler tasks) load on demand when the admin opens the
// Plex Maintenance panel — deliberately NOT folded into getSnapshot(), which
// polls every 3–12s for every user. Mutations are fire-and-forget; the panel
// re-reads itself, so there's nothing in the Next cache to revalidate.
// ============================================================
import { getSessionUser } from "@/lib/session";
import { isConfigured, getServiceSecret } from "@/lib/integrations/registry";
import {
  plexSections,
  plexButlerTasks,
  plexScanSection,
  plexAnalyzeSection,
  plexEmptyTrash,
  plexCleanBundles,
  plexOptimizeDb,
  plexRunButlerTask,
  type PlexSection,
  type PlexButlerTask,
} from "@/lib/integrations/clients";

async function requireAdmin() {
  const user = await getSessionUser();
  if (user.role !== "admin") throw new Error("forbidden");
}

export interface PlexPanelData {
  configured: boolean;
  hasToken: boolean;
  sections: PlexSection[];
  tasks: PlexButlerTask[];
  error?: string;
}

export type PlexActionResult = { ok: boolean; message: string };

async function run(fn: () => Promise<void>, started: string): Promise<PlexActionResult> {
  await requireAdmin();
  try {
    await fn();
    return { ok: true, message: started };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Action failed" };
  }
}

/** On-demand read for the panel. Never throws to the client — returns flags + an optional error.
 *  Sections and butler tasks are read independently so a butler failure (e.g. no Plex Pass)
 *  still renders the library table. */
export async function getPlexPanelData(): Promise<PlexPanelData> {
  await requireAdmin();
  const configured = await isConfigured("plex");
  const hasToken = configured && Boolean(await getServiceSecret("plex"));
  if (!hasToken) return { configured, hasToken: false, sections: [], tasks: [] };
  const [sections, tasks] = await Promise.all([
    plexSections().catch(() => null),
    plexButlerTasks().catch(() => [] as PlexButlerTask[]),
  ]);
  return {
    configured,
    hasToken,
    sections: sections ?? [],
    tasks,
    error: sections === null ? "Could not reach Plex — check the URL and that the token is the server owner's." : undefined,
  };
}

export async function scanSectionAction(id: string, force = false): Promise<PlexActionResult> {
  return run(() => plexScanSection(id, force), force ? "Metadata refresh started" : "Library scan started");
}

export async function analyzeSectionAction(id: string): Promise<PlexActionResult> {
  return run(() => plexAnalyzeSection(id), "Analysis started");
}

export async function emptyTrashAction(id?: string): Promise<PlexActionResult> {
  return run(() => plexEmptyTrash(id), id ? "Emptying trash" : "Emptying trash for all libraries");
}

export async function cleanBundlesAction(): Promise<PlexActionResult> {
  return run(() => plexCleanBundles(), "Clean bundles started");
}

export async function optimizeDbAction(): Promise<PlexActionResult> {
  return run(() => plexOptimizeDb(), "Database optimization started");
}

export async function runButlerTaskAction(name: string): Promise<PlexActionResult> {
  return run(() => plexRunButlerTask(name), "Task started");
}
