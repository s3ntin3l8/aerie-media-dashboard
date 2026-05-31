// ============================================================
// AERIE — data facade (server-only)
// Aggregates every upstream into one Snapshot. Each section falls
// back to the design's mock data when its service is unconfigured
// or erroring, so a dead upstream only degrades its own panel.
// Live calls only fire for services that have a stored secret, so
// the dev/mock server never hits the network.
// ============================================================
import "server-only";
import type { LibraryStat, MediaRequest, NowPlaying, QueueItem, RecentItem, Service, User } from "@/lib/types";
import { SERVICES as MOCK_SERVICES, NOW_PLAYING, REQUESTS, USERS, LIBRARY, RECENT, QUEUE, PLAYS_24H } from "@/lib/mock/data";
import { getServiceConfigs, getServiceSecret, getGroups, getVisibility, type GroupRow, type VisibilityRow } from "@/lib/integrations/registry";
import { gatusHealth, tautulliNowPlaying, jellyfinNowPlaying, overseerrRequests, arrQueue, type ServiceHealth } from "@/lib/integrations/clients";

export interface Snapshot {
  services: Service[];
  nowPlaying: NowPlaying[];
  requests: MediaRequest[];
  users: User[];
  library: LibraryStat[];
  recent: RecentItem[];
  queue: QueueItem[];
  plays24h: number[];
  groups: GroupRow[];
  visibility: VisibilityRow[];
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function padBeats(beats: number[]): number[] {
  if (beats.length >= 30) return beats.slice(-30);
  return [...Array(30 - beats.length).fill(1), ...beats];
}

export async function getSnapshot(): Promise<Snapshot> {
  const mockById = new Map(MOCK_SERVICES.map((s) => [s.id, s]));
  const [configs, groups, visibility] = await Promise.all([getServiceConfigs(), getGroups(), getVisibility()]);

  // Which services have a stored secret → eligible for a live call.
  const has = async (id: string) => (await getServiceSecret(id)) != null;
  const [gatusOn, ttOn, jfOn, osOn, sonarrOn, radarrOn] = await Promise.all([
    has("gatus"),
    has("tautulli"),
    has("jellyfin"),
    has("overseerr"),
    has("sonarr"),
    has("radarr"),
  ]);

  const [health, ttNow, jfNow, osReq, sonarrQ, radarrQ] = await Promise.all([
    gatusOn ? safe(gatusHealth) : Promise.resolve(null),
    ttOn ? safe(tautulliNowPlaying) : Promise.resolve(null),
    jfOn ? safe(jellyfinNowPlaying) : Promise.resolve(null),
    osOn ? safe(overseerrRequests) : Promise.resolve(null),
    sonarrOn ? safe(() => arrQueue("sonarr")) : Promise.resolve(null),
    radarrOn ? safe(() => arrQueue("radarr")) : Promise.resolve(null),
  ]);

  // services: DB config merged with live Gatus health (or mock health).
  const healthFor = (id: string, name: string): Pick<Service, "status" | "ms" | "uptime" | "beats"> => {
    if (health) {
      const h: ServiceHealth | undefined = health.find((x) => x.key === id || x.name.toLowerCase() === name.toLowerCase());
      if (h) return { status: h.status, ms: h.ms, uptime: h.uptime, beats: padBeats(h.beats) };
    }
    const m = mockById.get(id);
    return m ? { status: m.status, ms: m.ms, uptime: m.uptime, beats: m.beats } : { status: "up", ms: 0, uptime: 100, beats: padBeats([]) };
  };

  const services: Service[] = configs.map((c) => ({
    id: c.id,
    name: c.name,
    cat: c.cat,
    icon: c.icon,
    embeddable: c.embeddable,
    central: c.central,
    centralLabel: c.centralLabel ?? undefined,
    host: c.host,
    version: c.version ?? "",
    note: c.note ?? "",
    ...healthFor(c.id, c.name),
  }));

  const nowPlaying: NowPlaying[] = ttOn || jfOn ? [...(ttNow ?? []), ...(jfNow ?? [])] : NOW_PLAYING;
  const requests: MediaRequest[] = osOn ? (osReq ?? []) : REQUESTS;
  const queue: QueueItem[] = sonarrOn || radarrOn ? [...(sonarrQ ?? []), ...(radarrQ ?? [])] : QUEUE;

  // Library / recent / plays / members still come from mock (Tautulli-stats
  // and DB-mirrored members wiring is the next increment).
  return { services, nowPlaying, requests, users: USERS, library: LIBRARY, recent: RECENT, queue, plays24h: PLAYS_24H, groups, visibility };
}
