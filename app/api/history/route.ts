import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { tautulliStreamHistory } from "@/lib/integrations/clients";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let history = await tautulliStreamHistory();

  if (user.role !== "admin") {
    // Non-admins see only their own streams matched by username.
    // Tautulli's friendly_name may differ from the portal display name,
    // so we match case-insensitively against both name and email local-part.
    const needle = user.name.toLowerCase();
    const emailLocal = user.email.split("@")[0].toLowerCase();
    history = history.filter((r) => {
      const u = r.user.toLowerCase();
      return u === needle || u === emailLocal;
    });
  }

  return NextResponse.json({ history });
}
