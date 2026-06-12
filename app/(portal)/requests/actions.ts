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
import { overseerrCreateRequest, overseerrDeleteRequest, overseerrEditRequest, overseerrRequestDetails, overseerrReview, overseerrComment, overseerrUsers, overseerrUserQuota, overseerrMovieProfiles, overseerrTvProfiles, overseerrWatchlist, sonarrSeasonQuality, sonarrSeriesMeta, radarrMovieMeta, matchOverseerrUserId, bustCache } from "@/lib/integrations/clients";
import { QUALITY_PROFILES } from "@/lib/categories";
import type { AppUser, DiscoverItem, MediaArrDetail, MediaKind, QualityProfile, RequestStatus, SeasonQuality } from "@/lib/types";

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

function parseRequestId(id: string): number | null {
  const numeric = Number(id.replace(/^os-/, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function sameEmail(a: string | undefined, b: string | undefined): boolean {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  return Boolean(left && right && left === right);
}

async function canMutateRequest(user: AppUser, requestId: number): Promise<{ ok: true; status: RequestStatus } | { ok: false; message: string }> {
  const request = await overseerrRequestDetails(requestId);
  if (user.role === "admin") return { ok: true, status: request.status };

  const userId = await resolveOverseerrUserId(user);
  const ownsById = userId != null && request.requesterId === userId;
  const ownsByEmail = sameEmail(request.requesterEmail, user.email);
  return ownsById || ownsByEmail ? { ok: true, status: request.status } : { ok: false, message: "forbidden" };
}

export interface SubmitResult {
  ok: boolean;
  message: string;
  /** True when Overseerr auto-approved the request (no admin approval needed). */
  autoApproved?: boolean;
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
    const created = await overseerrCreateRequest({
      tmdbId: Number(pick.id),
      mediaType: pick.kind === "series" ? "tv" : "movie",
      seasons: pick.kind === "series" ? seasons : undefined,
      userId,
      profileId,
    });
    // Overseerr request status 2 = approved (auto-approve); 1 = pending admin approval.
    const autoApproved = created.status === 2;
    bustCache("overseerr:requests");
    bustCache("overseerr:requestCounts");
    return {
      ok: true,
      autoApproved,
      message: autoApproved ? `Approved "${pick.title}"` : `Requested "${pick.title}"`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

/** Approve or decline a request (admin). `id` is the snapshot's `os-<n>` id. */
export async function reviewRequest(id: string, action: "approve" | "decline", note?: string, mediaOverseerrId?: number): Promise<SubmitResult> {
  const user = await getSessionUser();
  if (user.role !== "admin") return { ok: false, message: "forbidden" };
  if (!(await overseerrOn())) return { ok: true, message: action === "approve" ? "Approved" : "Declined" };
  const numeric = parseRequestId(id);
  if (numeric == null) return { ok: true, message: "Updated" }; // mock id → no upstream
  try {
    await overseerrReview(numeric, action);
    if (note?.trim() && mediaOverseerrId) {
      // Post note as an Overseerr media comment — non-fatal if it fails.
      await overseerrComment(mediaOverseerrId, note.trim()).catch(() => undefined);
    }
    bustCache("overseerr:requests");
    bustCache("overseerr:requestCounts");
    return { ok: true, message: action === "approve" ? "Request approved" : "Request declined" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Action failed" };
  }
}

/** Cancel/delete a request. Server-side ownership is enforced before using the shared Overseerr mutation path. */
export async function deleteRequest(id: string): Promise<SubmitResult> {
  if (!(await overseerrOn())) return { ok: true, message: "Deleted" };
  const numeric = parseRequestId(id);
  if (numeric == null) return { ok: true, message: "Deleted" };
  try {
    const user = await getSessionUser();
    const allowed = await canMutateRequest(user, numeric);
    if (!allowed.ok) return { ok: false, message: allowed.message };
    if (allowed.status !== "pending" && allowed.status !== "approved") {
      return { ok: false, message: "Cannot cancel this request" };
    }
    await overseerrDeleteRequest(numeric);
    bustCache("overseerr:requests");
    bustCache("overseerr:requestCounts");
    return { ok: true, message: "Request cancelled" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not cancel" };
  }
}

/** Edit an existing pending request (seasons + quality profile). */
export async function editRequest(id: string, seasons: number[], quality?: string): Promise<SubmitResult> {
  if (!(await overseerrOn())) return { ok: true, message: "Updated" };
  const numeric = parseRequestId(id);
  if (numeric == null) return { ok: true, message: "Updated" };
  try {
    const user = await getSessionUser();
    const allowed = await canMutateRequest(user, numeric);
    if (!allowed.ok) return { ok: false, message: allowed.message };
    if (allowed.status !== "pending") return { ok: false, message: "Only pending requests can be edited" };
    const profileId = quality && quality !== "default" ? (Number(quality) || undefined) : undefined;
    await overseerrEditRequest(numeric, { seasons, profileId });
    bustCache("overseerr:requests");
    bustCache("overseerr:requestCounts");
    return { ok: true, message: "Request updated" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not update" };
  }
}

/**
 * Per-season downloaded quality for an available series, by its Sonarr id
 * (MediaRequest.arrId). Lazy-loaded by the detail modal; empty on missing config.
 */
export async function getSeasonQuality(seriesArrId: number): Promise<SeasonQuality[]> {
  if (!seriesArrId || !(await getServiceSecret("sonarr"))) return [];
  return sonarrSeasonQuality(seriesArrId).catch(() => []);
}

/**
 * Live Sonarr/Radarr detail (monitored / downloaded / quality) for the detail modal,
 * merged with Overseerr state client-side. Lazy-loaded on modal open.
 *  - movie → Radarr by tmdbId (monitored/hasFile/fileInfo)
 *  - series → Sonarr by arrId (monitored/hasFile + per-season quality); needs arrId
 * Returns {} when the relevant *arr isn't configured or the id is missing.
 */
export async function getMediaDetail(input: { tmdbId?: number; kind: MediaKind; arrId?: number }): Promise<MediaArrDetail> {
  try {
    if (input.kind === "movie") {
      if (!input.tmdbId || !(await getServiceSecret("radarr"))) return {};
      return await radarrMovieMeta(input.tmdbId);
    }
    if (input.kind === "series") {
      if (!input.arrId || !(await getServiceSecret("sonarr"))) return {};
      const [meta, seasons] = await Promise.all([
        sonarrSeriesMeta(input.arrId).catch(() => ({})),
        sonarrSeasonQuality(input.arrId).catch(() => [] as SeasonQuality[]),
      ]);
      return { ...meta, seasons };
    }
    return {};
  } catch {
    return {};
  }
}

/** Fetch the user's Plex watchlist for the request modal. */
export async function getWatchlist(): Promise<DiscoverItem[]> {
  if (!(await overseerrOn())) return [];
  return overseerrWatchlist().catch(() => []);
}
