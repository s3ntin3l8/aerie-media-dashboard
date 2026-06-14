import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { traefikRoutes } from "@/lib/integrations/clients";

export const dynamic = "force-dynamic";

// Admin-only debugging endpoint. The authoritative route data rides on the snapshot
// (each Service.route); this mirrors the per-upstream admin-route convention and lets an
// admin inspect raw correlated routers directly. traefikRoutes() resolves every active source
// (raw or aggregator, any id/name) and throws "not configured" when none exists → caught → [].
export async function GET() {
  const user = await getSessionUser();
  if (user.role !== "admin") return NextResponse.json([], { status: 403 });
  try {
    return NextResponse.json(await traefikRoutes(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json([]);
  }
}
