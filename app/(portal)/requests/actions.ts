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
import { overseerrCreateRequest, overseerrReview, overseerrRequests, overseerrUsers, matchOverseerrUserId } from "@/lib/integrations/clients";
import type { AppUser, DiscoverItem } from "@/lib/types";

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

/** The portal-side request quota for a user (DB `users.req_quota`), or null if unknown. */
async function userQuota(portalUserId: string): Promise<number | null> {
  try {
    await ensureDb();
    const rows = await db.select({ q: schema.users.reqQuota }).from(schema.users).where(eq(schema.users.id, portalUserId)).limit(1);
    return rows[0]?.q ?? null;
  } catch {
    return null;
  }
}

export interface SubmitResult {
  ok: boolean;
  message: string;
}

/** Create an Overseerr request for the signed-in user. */
export async function submitRequest(pick: DiscoverItem, seasons: number[]): Promise<SubmitResult> {
  const user = await getSessionUser();
  if (!(await overseerrOn())) {
    // Dev/mock: nothing to persist; the modal shows its own success panel.
    return { ok: true, message: `Requested “${pick.title}” — pending approval` };
  }
  try {
    // Portal-side quota gate: count the user's current Overseerr requests (by email)
    // against their DB quota. Advisory — not atomic against Overseerr — but the modal
    // disables re-submit so double-submits are unlikely.
    // NOTE: this reuses overseerrRequests() (a list fetch + enrichMedia on cold cache).
    // Overseerr's user object usually exposes `requestCount` via /api/v1/user — if so,
    // that's a cheaper, authoritative count that also avoids the take=50 window. Switch
    // to it once confirmed against the live instance.
    const quota = await userQuota(user.id);
    if (quota != null && user.email) {
      const key = user.email.trim().toLowerCase();
      const used = (await overseerrRequests()).filter((r) => r.requesterEmail?.trim().toLowerCase() === key).length;
      if (used >= quota) return { ok: false, message: `Request limit reached (${used}/${quota})` };
    }
    // Attribution: create as the matched Overseerr user when we can resolve one
    // (explicit link or email match), otherwise it's created as the API key's owner.
    const userId = await resolveOverseerrUserId(user);
    await overseerrCreateRequest({
      tmdbId: Number(pick.id),
      mediaType: pick.kind === "series" ? "tv" : "movie",
      seasons: pick.kind === "series" ? seasons : undefined,
      userId,
    });
    return { ok: true, message: `Requested “${pick.title}”` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

/** Approve or decline a request (admin). `id` is the snapshot's `os-<n>` id. */
export async function reviewRequest(id: string, action: "approve" | "decline"): Promise<SubmitResult> {
  const user = await getSessionUser();
  if (user.role !== "admin") return { ok: false, message: "forbidden" };
  if (!(await overseerrOn())) return { ok: true, message: action === "approve" ? "Approved" : "Declined" };
  const numeric = Number(id.replace(/^os-/, ""));
  if (!Number.isFinite(numeric)) return { ok: true, message: "Updated" }; // mock id → no upstream
  try {
    await overseerrReview(numeric, action);
    return { ok: true, message: action === "approve" ? "Request approved" : "Request declined" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Action failed" };
  }
}
