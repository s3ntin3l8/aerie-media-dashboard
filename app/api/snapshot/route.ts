import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/data/snapshot";
import { scrubForMember } from "@/lib/data/scrub";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const snapshot = await getSnapshot();
  const data = session.user.role === "admin" ? snapshot : scrubForMember(snapshot);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
