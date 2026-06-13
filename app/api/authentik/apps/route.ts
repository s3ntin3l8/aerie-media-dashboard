import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { authentikApps } from "@/lib/integrations/clients";

export const dynamic = "force-dynamic";

// Admin-only debugging endpoint. The authoritative access data rides on the snapshot
// (each Service.authentik); this mirrors the per-upstream admin-route convention.
export async function GET() {
  const user = await getSessionUser();
  if (user.role !== "admin") return NextResponse.json([], { status: 403 });
  const creds = await getServiceCredentials("authentik");
  if (!creds) return NextResponse.json([]);
  try {
    return NextResponse.json(await authentikApps(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json([]);
  }
}
