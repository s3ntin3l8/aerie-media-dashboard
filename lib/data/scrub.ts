// ============================================================
// AERIE — build a member-safe snapshot from the admin snapshot
// Non-admin users should never see infrastructure details, member
// lists, or admin-only widget data. This module uses an ALLOWLIST
// (not a denylist) so new Snapshot/Service fields are hidden by
// default rather than leaking until someone explicitly strips them.
// ============================================================
import "server-only";
import type { Snapshot } from "@/lib/data/snapshot";
import type { Service } from "@/lib/types";

/**
 * Return a snapshot suitable for a non-admin member: only the fields
 * explicitly listed here are forwarded; every other field defaults to
 * empty/null/false so future additions fail-safe instead of leaking.
 */
export function scrubForMember(s: Snapshot): Snapshot {
  return {
    // ── Member-visible fields ──
    services: s.services.map(stripServiceForMember),
    nowPlaying: s.nowPlaying,
    requests: s.requests,
    library: s.library,
    libraryAll: s.libraryAll,
    recent: s.recent,
    recentAll: s.recentAll,
    plays24h: s.plays24h,
    bandwidth: s.bandwidth,
    upcoming: s.upcoming,
    discover: s.discover,
    requestCounts: s.requestCounts,
    metrics: s.metrics,
    metricsSource: s.metricsSource,
    topStats: s.topStats,
    issues: s.issues,
    bazarrWanted: s.bazarrWanted,
    lazylibrarian: s.lazylibrarian,
    listenarr: s.listenarr,
    // ── Admin-only: hardcoded empty / null / false ──
    users: [],
    groups: [],
    visibility: [],
    adminGroup: "",
    traefikDiscovered: [],
    traefikDismissed: [],
    traefikInstances: [],
    traefikConfigured: false,
    authentikConfigured: false,
    metricsBySource: { prometheus: null, beszel: null },
    beszelSystemId: null,
    prometheusConfigured: false,
    beszelConfigured: false,
    lokiConfigured: false,
    arrQueueConfigured: false,
    nzbgetConfigured: false,
    nzbgetStatus: null,
    qbittorrentConfigured: false,
    qbittorrent: null,
    arrHealth: [],
    downloads: [],
    queue: [],
    queueSource: "nzbget" as const,
    storage: [],
    wizarr: null,
    prowlarr: null,
    agregarr: null,
    nzbhydra: null,
  };
}

function stripServiceForMember(s: Service): Service {
  // Explicit allowlist — new Service fields are hidden until deliberately added here.
  return {
    id: s.id,
    name: s.name,
    cat: s.cat,
    icon: s.icon,
    logoSlug: s.logoSlug,
    embeddable: s.embeddable,
    keepAlive: s.keepAlive,
    active: s.active,
    central: s.central,
    centralLabel: s.centralLabel,
    host: s.host,
    scheme: s.scheme,
    version: s.version,
    status: s.status,
    uptime: s.uptime,
    uptime24h: s.uptime24h,
    ms: s.ms,
    beats: s.beats,
    lastIncidentAt: s.lastIncidentAt,
    msHistory: s.msHistory,
    note: s.note,
    route: s.route,
    // Omitted (admin-only): internalUrl, insecureTls, monitoringKey,
    // lokiQuery, hasSecret, forwardAuthConfig, authentik
  };
}
