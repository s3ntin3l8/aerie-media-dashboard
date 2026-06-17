import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";

// Health probe — no auth required (orchestrators must reach this without a session).
// Returns 200 {"status":"ok"} when the DB is reachable, 503 {"status":"error"} otherwise.
// Does NOT leak any detail about the environment, config, or error message.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDb();
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
