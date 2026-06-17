// ============================================================
// AERIE — strip admin-only fields from the snapshot for members
// Non-admin users should never see infrastructure details, member
// lists, or admin-only widget data. The facade computes everything
// for the admin view; this helper scrubs what members don't need.
// ============================================================
import "server-only";
import type { Snapshot } from "@/lib/data/snapshot";
import type { Service } from "@/lib/types";

const MEMBER_EMPTY_ARRAY = [] as const;
const MEMBER_EMPTY_MAP = {} as const;

/**
 * Return a snapshotsuitable for a non-admin member: strip all fields
 * that are only consumed by admin UI. Uses object spread + explicit
 * overrides so the return type stays compatible with `Snapshot`.
 */
export function scrubForMember(s: Snapshot): Snapshot {
  return {
    ...s,
    // ── Admin-only snapshot-level fields ──
    users: [],
    groups: [],
    visibility: [],
    adminGroup: "",
    traefikDiscovered: [],
    traefikDismissed: [],
    traefikInstances: [],
    metricsBySource: { prometheus: null, beszel: null },
    metricsSource: s.metricsSource,
    beszelSystemId: null,
    prometheusConfigured: false,
    beszelConfigured: false,
    traefikConfigured: false,
    lokiConfigured: false,
    arrQueueConfigured: false,
    nzbgetConfigured: false,
    qbittorrentConfigured: false,
    arrHealth: [],
    downloads: [],
    queue: [],
    queueSource: "nzbget" as const,
    storage: [],
    topStats: s.topStats,
    // ── Per-service: strip admin-only fields ──
    services: s.services.map(stripServiceForMember),
  };
}

function stripServiceForMember(s: Service): Service {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { authentik, ...rest } = s;
  return rest;
}