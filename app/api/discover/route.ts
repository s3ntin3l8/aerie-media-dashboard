import { NextRequest, NextResponse } from "next/server";
import type { DiscoverItem } from "@/lib/types";
import { DISCOVER } from "@/lib/mock/data";
import { getServiceSecret } from "@/lib/integrations/registry";
import { overseerrSearch } from "@/lib/integrations/clients";

// Type-ahead catalog search. Real Overseerr search when configured; otherwise
// the mock DISCOVER catalog filtered by query. Called by the request modal with
// an AbortController so superseded keystrokes cancel.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  const overseerrConfigured = (await getServiceSecret("overseerr")) != null;
  if (overseerrConfigured) {
    try {
      const results = await overseerrSearch(q);
      return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
    } catch {
      /* fall back to mock on upstream error */
    }
  }

  const ql = q.toLowerCase();
  const results: DiscoverItem[] = DISCOVER.filter((d) => !ql || d.title.toLowerCase().includes(ql));
  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
