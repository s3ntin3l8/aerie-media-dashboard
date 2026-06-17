import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/data/snapshot";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (user.id === "anon") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const snapshot = await getSnapshot();
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
