"use server";
// ============================================================
// AERIE — request mutations (server actions)
// Real Overseerr create/approve/decline when configured; no-ops in
// dev/mock so the modal flows still resolve.
// ============================================================
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { ensureDb } from "@/lib/db/bootstrap";
import { getSessionUser } from "@/lib/session";
import { getServiceSecret } from "@/lib/integrations/registry";
import { overseerrCreateRequest, overseerrDeleteRequest, overseerrEditRequest, overseerrReview, overseerrComment, overseerrUsers, overseerrUserQuota, overseerrMovieProfiles, overseerrTvProfiles, overseerrWatchlist, matchOverseerrUserId, bustCache } from "@/lib/integrations/clients";
import { QUALITY_PROFILES } from "@/lib/categories";
import type { AppUser, DiscoverItem, QualityProfile } from "@/lib/types";

async function overseerrOn(): Promise<boolean> {
  return (await getServiceSecret("overseerr")) != null;
}

/** Look up the explicit accountLinks override for a portal user (manual link wins). */
async function linkedOverseerrUserId(portalUserId: string): Promise<number | undefined> {
  try {
    await ensureDb();
    const rows = await db.select({ id: schema.accountLinks.overseerrUserId }).from(schema.accountLinks).where(eq(schema.accountLinks.portalUserId, portalUserId)).limit(1);
    const v = rows[0]?.id;
    return v ? Number(v) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a portal user to an Overseerr user id for attribution:
 * explicit accountLinks override first, else match by email (case-insensitive).
 */
async function resolveOverseerrUserId(user: AppUser): Promise<number | undefined> {
  const override = await linkedOverseerrUserId(user.id);
  if (override) return override;
  try {
    return matchOverseerrUserId(await overseerrUsers(), user.email);
  } catch {
    return undefined;
  }
}

export interface SubmitResult {
  ok: boolean;
  message: string;
}

/** Return live quality profiles for the request modal. Falls back to static list when Overseerr is not configured. */
export async function getQualityProfiles(mediaType: "movie" | "tv"): Promise<QualityProfile[]> {
  if (!(await overseerrOn())) return QUALITY_PROFILES;
  const profiles = mediaType === "movie"
    ? await overseerrMovieProfiles().catch(() => [])
    : await overseerrTvProfiles().catch(() => []);
  return profiles.length > 0 ? profiles : QUALITY_PROFILES;
}

/** Create an Overseerr request for the signed-in user. */
export async function submitRequest(pick: DiscoverItem, seasons: number[], quality?: string): Promise<SubmitResult> {
  const user = await getSessionUser();
  if (!(await overseerrOn())) {
    // Dev/mock: nothing to persist; the modal shows its own success panel.
    return { ok: true, message: `Requested "${pick.title}" — pending approval` };
  }
  try {
    // Quota gate: use Overseerr's authoritative restricted flag (respects rolling-window days).
    const userId = await resolveOverseerrUserId(user);
    if (userId != null) {
      const quota = await overseerrUserQuota(userId);
      const isMovie = pick.kind !== "series";
      const q = isMovie ? quota.movie : quota.tv;
      if (q.restricted) {
        const label = isMovie ? "movie" : "TV";
        return { ok: false, message: `${label} request limit reached (${q.used}/${q.limit ?? "∞"})` };
      }
    }
    const profileId = quality && quality !== "default" ? (Number(quality) || undefined) : undefined;
    await overseerrCreateRequest({
      tmdbId: Number(pick.id),
      mediaType: pick.kind === "series" ? "tv" : "movie",
      seasons: pick.kind === "series" ? seasons : undefined,
      userId,
      profileId,
    });
    return { ok: true, message: `Requested "${pick.title}"` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

/** Approve or decline a request (admin). `id` is the snapshot's `os-<n>` id. */
export async function reviewRequest(id: string, action: "approve" | "decline", note?: string, mediaOverseerrId?: number): Promise<SubmitResult> {
  const user = await getSessionUser();
  if (user.role !== "admin") return { ok: false, message: "forbidden" };
  if (!(await overseerrOn())) return { ok: true, message: action === "approve" ? "Approved" : "Declined" };
  const numeric = Number(id.replace(/^os-/, ""));
  if (!Number.isFinite(numeric)) return { ok: true, message: "Updated" }; // mock id → no upstream
  try {
    await overseerrReview(numeric, action);
    if (note?.trim() && mediaOverseerrId) {
      // Post note as an Overseerr media comment — non-fatal if it fails.
      await overseerrComment(mediaOverseerrId, note.trim()).catch(() => undefined);
    }
    return { ok: true, message: action === "approve" ? "Request approved" : "Request declined" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Action failed" };
  }
}

/** Cancel/delete a request. Overseerr enforces ownership — users can delete their own pending requests; admins can delete any. */
export async function deleteRequest(id: string): Promise<SubmitResult> {
  if (!(await overseerrOn())) return { ok: true, message: "Deleted" };
  const numeric = Number(id.replace(/^os-/, ""));
  if (!Number.isFinite(numeric)) return { ok: true, message: "Deleted" };
  try {
    await overseerrDeleteRequest(numeric);
    bustCache("overseerr:requestCounts");
    return { ok: true, message: "Request cancelled" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not cancel" };
  }
}

/** Edit an existing pending request (seasons + quality profile). */
export async function editRequest(id: string, seasons: number[], quality?: string): Promise<SubmitResult> {
  if (!(await overseerrOn())) return { ok: true, message: "Updated" };
  const numeric = Number(id.replace(/^os-/, ""));
  if (!Number.isFinite(numeric)) return { ok: true, message: "Updated" };
  try {
    const profileId = quality && quality !== "default" ? (Number(quality) || undefined) : undefined;
    await overseerrEditRequest(numeric, { seasons, profileId });
    bustCache("overseerr:requestCounts");
    return { ok: true, message: "Request updated" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not update" };
  }
}

/** Fetch the user's Plex watchlist for the request modal. */
export async function getWatchlist(): Promise<DiscoverItem[]> {
  if (!(await overseerrOn())) return [];
  return overseerrWatchlist().catch(() => []);
}
