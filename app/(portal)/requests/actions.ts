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
import { overseerrCreateRequest, overseerrReview } from "@/lib/integrations/clients";
import type { DiscoverItem } from "@/lib/types";

async function overseerrOn(): Promise<boolean> {
  return (await getServiceSecret("overseerr")) != null;
}

/** Look up the Overseerr user id linked to a portal user (for attribution). */
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
    // Attribution: create as the linked Overseerr user when we have a mapping,
    // otherwise it's created as the API key's owner (admin). The link isn't
    // populated until Plex-source identity linking is set up.
    const userId = await linkedOverseerrUserId(user.id);
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
