// ============================================================
// AERIE — Authentik upstream client (server-only)
// Per-app SSO access (which groups/users may access each application).
// Read-only: list applications + their provider, and resolve "who can access" from the policy
// bindings. Complements Traefik's provider-agnostic "behind SSO" signal with the actual groups.
// ============================================================
import "server-only";
import { serviceClient, type ServiceClient } from "../serviceClient";
import { cached } from "./cache";
import type { AuthentikAccess } from "@/lib/types";

interface AuthentikProviderObj { name?: string; verbose_name?: string; component?: string }
interface AuthentikApp {
  pk: string;
  name: string;
  slug: string;
  launch_url?: string | null;
  meta_launch_url?: string | null;
  provider_obj?: AuthentikProviderObj | null;
}
interface AuthentikBinding {
  target?: string | null; // the app pk when bound to an application
  group?: string | null;
  group_obj?: { name?: string } | null;
  user?: number | null;
  policy?: string | null;
  enabled?: boolean;
  negate?: boolean;
}
interface AuthentikPage<T> { results?: T[]; pagination?: { next?: number } }

/** The hostname an Authentik app launches at (first absolute launch URL), for correlating to a service. */
export function appHost(app: { launch_url?: string | null; meta_launch_url?: string | null }): string | null {
  for (const u of [app.meta_launch_url, app.launch_url]) {
    if (u && /^https?:\/\//i.test(u)) {
      try { return new URL(u).hostname.toLowerCase(); } catch { /* skip unparseable */ }
    }
  }
  return null;
}

/** Reduce an app's policy bindings to an access summary. No enabled access binding → everyone. */
export function resolveAccess(bindings: AuthentikBinding[]): Pick<AuthentikAccess, "everyone" | "groups" | "users" | "policyGated"> {
  const active = bindings.filter((b) => b.enabled !== false && b.negate !== true);
  const groups: string[] = [];
  let users = 0;
  let policyGated = false;
  for (const b of active) {
    if (b.group) groups.push(b.group_obj?.name ?? b.group);
    else if (b.user != null) users += 1;
    else if (b.policy) policyGated = true;
  }
  return { everyone: active.length === 0, groups: [...new Set(groups)], users, policyGated };
}

async function authentikAppsUncached(svc: ServiceClient): Promise<AuthentikAccess[]> {
  const base = svc.baseUrl;
  const opts = { headers: { Authorization: `Bearer ${svc.apiKey}` } };
  const [apps, binds] = await Promise.all([
    svc.json<AuthentikPage<AuthentikApp>>(`${base}/api/v3/core/applications/?superuser_full_list=true&page_size=1000`, opts),
    svc.json<AuthentikPage<AuthentikBinding>>(`${base}/api/v3/policies/bindings/?page_size=1000`, opts),
  ]);
  if (apps.pagination?.next) console.warn("[authentik] applications list truncated at page_size=1000");
  if (binds.pagination?.next) console.warn("[authentik] bindings list truncated at page_size=1000");

  // Group bindings by their target app pk (bindings targeting flows/stages have no matching app).
  const byTarget = new Map<string, AuthentikBinding[]>();
  for (const b of binds.results ?? []) {
    if (!b.target) continue;
    (byTarget.get(b.target) ?? byTarget.set(b.target, []).get(b.target)!).push(b);
  }

  const out: AuthentikAccess[] = [];
  for (const app of apps.results ?? []) {
    const host = appHost(app);
    if (!host) continue; // only apps we can correlate to a service host
    out.push({
      serviceId: "", // correlated in getSnapshot()
      appName: app.name,
      appSlug: app.slug,
      host,
      providerName: app.provider_obj?.name ?? null,
      providerType: app.provider_obj?.verbose_name ?? app.provider_obj?.component ?? null,
      ...resolveAccess(byTarget.get(app.pk) ?? []),
    });
  }
  return out;
}

export async function authentikApps(): Promise<AuthentikAccess[]> {
  const svc = await serviceClient("authentik");
  // Apps/bindings change slowly; cache to spare Authentik across the 12s poll.
  return cached("authentik:apps", 30_000, () => authentikAppsUncached(svc));
}