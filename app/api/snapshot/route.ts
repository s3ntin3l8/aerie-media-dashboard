import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/data/snapshot";

// Live data feed polled by the client DataProvider. Protected by proxy.ts
// when OIDC is configured; open in dev/mock mode.
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getSnapshot();
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
