import { Home } from "@/components/views/Home";
import { getSessionUser } from "@/lib/session";
import { getDashboards } from "@/lib/integrations/registry";

// Seed the modular homescreen with the signed-in user's saved per-role layouts
// (null when none stored yet — Home falls back to the default arrangement).
export default async function HomePage() {
  const user = await getSessionUser();
  const dashboards = user && user.id !== "anon" ? await getDashboards(user.id) : null;
  return <Home initialDashboards={dashboards} />;
}
