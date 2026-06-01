import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { gatusHealth } from "@/lib/integrations/clients";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (user.role !== "admin") return NextResponse.json([], { status: 403 });
  const creds = await getServiceCredentials("gatus");
  if (!creds) return NextResponse.json([]);
  try {
    const health = await gatusHealth();
    return NextResponse.json(
      health.map((h) => ({ key: h.key, name: h.name, group: h.group })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json([]);
  }
}
