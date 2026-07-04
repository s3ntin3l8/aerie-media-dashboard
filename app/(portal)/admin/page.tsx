import { redirect } from "next/navigation";
import { Admin } from "@/components/views/Admin";
import { getSessionUser } from "@/lib/session";

// Session is request-scoped; never prerender the admin shell.
export const dynamic = "force-dynamic";

// Server-side admin gate (defence in depth alongside middleware.ts and the
// per-action requireAdmin() guards). A non-admin who reaches /admin — e.g. if
// the middleware matcher is ever misconfigured — is redirected home rather than
// served the admin view route.
export default async function AdminPage() {
  const user = await getSessionUser();
  if (user.role !== "admin") redirect("/");
  return <Admin />;
}
