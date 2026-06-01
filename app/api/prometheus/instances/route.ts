import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { prometheusInstances } from "@/lib/integrations/clients";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (user.role !== "admin") return NextResponse.json([], { status: 403 });
  const creds = await getServiceCredentials("prometheus");
  if (!creds) return NextResponse.json([]);
  try {
    return NextResponse.json(await prometheusInstances(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json([]);
  }
}
