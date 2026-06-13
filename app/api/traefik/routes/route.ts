import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { traefikRoutes } from "@/lib/integrations/clients";

export const dynamic = "force-dynamic";

// Admin-only debugging endpoint. The authoritative route data rides on the snapshot
// (each Service.route); this mirrors the per-upstream admin-route convention and lets an
// admin inspect raw correlated routers directly.
export async function GET() {
  const user = await getSessionUser();
  if (user.role !== "admin") return NextResponse.json([], { status: 403 });
  const creds = await getServiceCredentials("traefik");
  if (!creds) return NextResponse.json([]);
  try {
    return NextResponse.json(await traefikRoutes(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json([]);
  }
}
