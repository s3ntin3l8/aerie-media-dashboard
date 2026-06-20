import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSessionUser } from "@/lib/session";
import { tautulliStreamHistory } from "@/lib/integrations/clients";

export const dynamic = "force-dynamic";

export async function GET() {
  // Real auth gate: getSessionUser() never returns null (it falls back to a guest), so it can't
  // be used as the auth signal. Check the live session first, then resolve the normalized user.
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const user = await getSessionUser();

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
