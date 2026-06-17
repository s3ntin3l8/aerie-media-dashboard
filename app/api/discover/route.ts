import { NextRequest, NextResponse } from "next/server";
import { overseerrSearch } from "@/lib/integrations/clients";
import { getServiceSecret } from "@/lib/integrations/registry";
import { getSessionUser } from "@/lib/session";
import type { DiscoverItem } from "@/lib/types";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (user.id === "anon") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  const overseerrConfigured = (await getServiceSecret("overseerr")) != null;
  if (overseerrConfigured) {
    try {
      return NextResponse.json(await overseerrSearch(q), { headers: { "Cache-Control": "no-store" } });
    } catch {
      /* upstream error → empty results */
    }
  }

  const results: DiscoverItem[] = [];
  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
