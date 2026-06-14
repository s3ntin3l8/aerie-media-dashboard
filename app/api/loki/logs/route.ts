import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getServiceConfigs } from "@/lib/integrations/registry";
import { lokiTail, lokiSelectorFor } from "@/lib/integrations/clients";

export const dynamic = "force-dynamic";

// Admin-only, on-demand log tail for one service. Logs can contain secrets/PII, so this is
// gated to admins and never rides the snapshot poll. Resolves the service's LogQL selector
// (explicit `lokiQuery`, else the inferred default) and queries the active Loki source.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (user.role !== "admin") return NextResponse.json([], { status: 403 });

  const sp = req.nextUrl.searchParams;
  const serviceId = sp.get("serviceId");
  if (!serviceId) return NextResponse.json([], { status: 400 });
  const limit = Number(sp.get("limit")) || undefined;
  const sinceMs = Number(sp.get("sinceMs")) || undefined;

  const cfg = (await getServiceConfigs()).find((c) => c.id === serviceId);
  if (!cfg) return NextResponse.json([], { status: 404 });

  try {
    const lines = await lokiTail(lokiSelectorFor(cfg), { limit, sinceMs });
    return NextResponse.json(lines, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json([]);
  }
}
