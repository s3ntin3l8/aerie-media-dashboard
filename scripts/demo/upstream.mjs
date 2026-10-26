/**
 * The demo's fake upstream: one loopback HTTP server that stands in for every
 * service Aerie polls (Tautulli, Overseerr, Sonarr, Radarr, NZBGet, Gatus,
 * Prometheus, plus the artwork they serve). Aerie has no mock fallback, so
 * without this every panel would be an empty state.
 *
 * Each service lives under its own path prefix (`/tautulli/...`), matching the
 * `internalUrl`s in ./config.mjs. Titles and people come only from ./catalog.mjs.
 * Anything that moves (stream progress, bandwidth, download queues, graphs) is a
 * pure function of the clock, never of a request counter, so the dashboard's 3s
 * polling shows steady motion however often it asks. Response shapes follow what
 * lib/integrations/clients/* parses; tests/unit/demo-upstream.test.ts runs those
 * real clients against this server to catch drift.
 */
import http from "node:http";
import { CATALOG, LIBRARIES, REQUESTS, USERS, ADMIN, titleById, userById } from "./catalog.mjs";
import { GATUS_NAMES, SERVICES } from "./config.mjs";
import { avatarForUser, posterForRef } from "./posters.mjs";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const GiB = 1024 ** 3;
const TiB = 1024 ** 4;

/** Small seeded PRNG (mulberry32), so generated lists are the same on every run. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 0..1 wobble of time `t` (seconds), different per `seed`. */
const wobble = (t, seed) =>
  0.5 + 0.5 * (0.6 * Math.sin(t / (11 + (seed % 7)) + seed) + 0.4 * Math.sin(t / (3.1 + (seed % 3)) + seed * 2));

const iso = (ms) => new Date(ms).toISOString();
const pad = (n) => String(n).padStart(2, "0");
const hms = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(Math.floor(sec % 60))}`;

/** Overseerr media status for a title: its request's, else "available" (it is in the library). */
function mediaStatusOf(tmdbId) {
  const r = REQUESTS.find((x) => x.tmdbId === tmdbId);
  return r ? r.mediaStatus : 5;
}

const EPISODE_NAMES = ["The Tide Table", "Low Water", "A Quiet Signal", "Winter Rules", "Paper Boats", "The Long Way Round", "Lamp Oil", "Second Shift"];

// ── Tautulli ────────────────────────────────────────────────────────────────

/** The four live Plex sessions. `kbps` wobbles over time; `startPct` is where playback began. */
const STREAMS = [
  { key: "101", tmdbId: 9101, userId: 2, startPct: 31, kbps: 38400, res: "4k", codec: "hevc", decision: "direct play", player: "Living Room TV", platform: "Android", product: "Plex for Android (TV)", local: true, state: "playing" },
  { key: "102", tmdbId: 9201, userId: 4, startPct: 54, kbps: 8000, res: "1080", codec: "h264", decision: "transcode", player: "iPhone 15", platform: "iOS", product: "Plex for iOS", local: false, state: "playing", season: 2, episode: 5 },
  { key: "103", tmdbId: 9202, userId: 5, startPct: 12, kbps: 12400, res: "1080", codec: "h264", decision: "direct play", player: "Chrome", platform: "Chrome", product: "Plex Web", local: true, state: "playing", season: 1, episode: 3 },
  { key: "104", tmdbId: 9206, userId: 7, startPct: 73, kbps: 25200, res: "4k", codec: "hevc", decision: "direct play", player: "Apple TV", platform: "tvOS", product: "Plex for Apple TV", local: true, state: "paused", season: 1, episode: 7 },
];

const thumbOf = (tmdbId) => `/library/metadata/${tmdbId}/thumb/1`;
const artOf = (tmdbId) => `/library/metadata/${tmdbId}/art/1`;

function tautulliSession(s, t, elapsedSec) {
  const title = titleById(s.tmdbId);
  const isTv = title.type === "tv";
  const durationMs = title.runtime * MIN;
  const progress = s.state === "paused" ? s.startPct : (s.startPct + (elapsedSec * 1000 * 100) / durationMs) % 100;
  const bandwidth = s.state === "paused" ? 0 : Math.round(s.kbps * (0.92 + 0.16 * wobble(t / 1000, Number(s.key))));
  const user = userById(s.userId);
  const episodeTitle = EPISODE_NAMES[(s.tmdbId + s.key.length) % EPISODE_NAMES.length];
  return {
    session_key: s.key,
    full_title: isTv ? `${title.title} - ${episodeTitle}` : title.title,
    title: isTv ? episodeTitle : title.title,
    media_type: isTv ? "episode" : "movie",
    year: String(title.year),
    rating_key: String(title.tmdbId * 10 + 1),
    grandparent_rating_key: String(title.tmdbId),
    guids: [`tmdb://${title.tmdbId}`],
    parent_title: isTv ? `Season ${s.season}` : "",
    grandparent_title: isTv ? title.title : "",
    user: user.name,
    user_id: user.id,
    user_thumb: `/users/${user.id}/avatar`,
    player: s.player,
    platform: s.platform,
    platform_version: "17.4",
    product: s.product,
    product_version: "9.31",
    device: s.platform,
    quality_profile: s.decision === "transcode" ? "Original (transcoded)" : "Original",
    video_full_resolution: s.res,
    video_codec: s.codec,
    stream_video_codec: s.decision === "transcode" ? "h264" : s.codec,
    transcode_decision: s.decision,
    video_decision: s.decision === "transcode" ? "transcode" : "direct play",
    audio_decision: "direct play",
    subtitle_decision: "",
    stream_bitrate: String(bandwidth),
    bitrate: String(s.kbps),
    bandwidth: String(bandwidth),
    progress_percent: progress.toFixed(1),
    duration: String(durationMs),
    state: s.state,
    thumb: isTv ? "" : thumbOf(title.tmdbId),
    grandparent_thumb: isTv ? thumbOf(title.tmdbId) : "",
    art: isTv ? "" : artOf(title.tmdbId),
    grandparent_art: isTv ? artOf(title.tmdbId) : "",
    summary: title.overview,
    media_index: s.episode ?? "",
    parent_media_index: s.season ?? "",
    originally_available_at: `${title.year}-03-14`,
    content_rating: isTv ? "TV-14" : "PG-13",
    genres: title.genres,
    container: "mkv",
    stream_container: s.decision === "transcode" ? "mkv" : "mkv",
    audio_codec: "eac3",
    stream_audio_codec: "eac3",
    audio_channels: "6",
    stream_audio_channels: "6",
    audio_channel_layout: "5.1(side)",
    video_dynamic_range: s.res === "4k" ? "HDR" : "SDR",
    video_framerate: "24p",
    location: s.local ? "lan" : "wan",
    ip_address_public: s.local ? "" : "203.0.113.24",
    secure: "1",
    relayed: "0",
    local: s.local ? "1" : "0",
    transcode_hw_decoding: s.decision === "transcode" ? "1" : "0",
    transcode_hw_encoding: s.decision === "transcode" ? "1" : "0",
    transcode_throttled: "0",
    transcode_speed: s.decision === "transcode" ? "2.4" : "",
    transcode_progress: s.decision === "transcode" ? String(Math.min(100, Math.round(progress + 4))) : "",
    subtitles: "0",
  };
}

/** Evening-weighted play history (newest first), `hoursAgo` fixed per record so it is stable. */
const HISTORY = (() => {
  const rand = rng(77);
  const rows = [];
  for (let i = 0; i < 150; i++) {
    // 40 plays in the last 24h, the rest spread over the week; evenings are busier.
    const recent = i < 40;
    const hoursAgo = recent ? rand() * 23 : 24 + rand() * 144;
    const title = CATALOG[Math.floor(rand() * CATALOG.length)];
    const user = USERS[Math.floor(rand() * USERS.length)];
    rows.push({ hoursAgo, title, user, ep: 1 + Math.floor(rand() * 8), season: 1 + Math.floor(rand() * 2), minutes: 20 + Math.floor(rand() * 80), transcode: rand() < 0.25 });
  }
  return rows.sort((a, b) => a.hoursAgo - b.hoursAgo);
})();

function tautulliHistory(now, afterMs, length) {
  const records = HISTORY.filter((h) => now - h.hoursAgo * HOUR >= afterMs)
    .slice(0, length)
    .map((h, i) => {
      const isTv = h.title.type === "tv";
      const started = Math.floor((now - h.hoursAgo * HOUR) / 1000);
      return {
        row_id: 5000 - i,
        title: isTv ? EPISODE_NAMES[h.ep % EPISODE_NAMES.length] : h.title.title,
        parent_title: isTv ? `Season ${h.season}` : "",
        grandparent_title: isTv ? h.title.title : "",
        media_type: isTv ? "episode" : "movie",
        year: h.title.year,
        rating_key: h.title.tmdbId * 10 + 1,
        thumb: thumbOf(h.title.tmdbId),
        grandparent_thumb: isTv ? thumbOf(h.title.tmdbId) : "",
        friendly_name: h.user.name,
        user_id: h.user.id,
        started,
        stopped: started + h.minutes * 60,
        date: started,
        duration: h.minutes * 60,
        paused_counter: 0,
        platform: h.transcode ? "iOS" : "Android",
        player: h.transcode ? "iPhone 15" : "Living Room TV",
        ip_address: "192.168.1.20",
        bitrate: h.transcode ? 8000 : 24000,
        media_index: isTv ? h.ep : undefined,
        parent_media_index: isTv ? h.season : undefined,
        transcode_decision: h.transcode ? "transcode" : "direct play",
        watched_status: 1,
      };
    });
  return records;
}

function tautulli(cmd, q, ctx) {
  switch (cmd) {
    case "get_activity": {
      const sessions = STREAMS.map((s) => tautulliSession(s, ctx.now, ctx.elapsedSec));
      const total = sessions.reduce((sum, s) => sum + Number(s.bandwidth), 0);
      const wan = sessions.filter((s) => s.location === "wan").reduce((sum, s) => sum + Number(s.bandwidth), 0);
      return { stream_count: String(sessions.length), total_bandwidth: total, wan_bandwidth: wan, sessions };
    }
    case "get_users":
      return [ADMIN, ...USERS].map((u) => ({ user_id: u.id, username: u.username ?? "admin", friendly_name: u.name, email: u.email, user_thumb: `/users/${u.id}/avatar` }));
    case "get_libraries":
      return [
        { section_type: "movie", section_name: LIBRARIES.movies.name, count: String(LIBRARIES.movies.count) },
        { section_type: "show", section_name: LIBRARIES.shows.name, count: String(LIBRARIES.shows.count), child_count: String(LIBRARIES.shows.episodes) },
        { section_type: "artist", section_name: LIBRARIES.music.name, count: String(LIBRARIES.music.artists), parent_count: String(LIBRARIES.music.albums), child_count: String(LIBRARIES.music.tracks) },
      ];
    case "get_history": {
      const afterMs = q.get("after") ? Date.parse(q.get("after")) : 0;
      const data = tautulliHistory(ctx.now, afterMs, Number(q.get("length") ?? 1000));
      return { recordsFiltered: data.length, recordsTotal: HISTORY.length, data };
    }
    case "get_recently_added": {
      const ids = [9104, 9207, 9107, 9210, 9205, 9106];
      const items = ids.slice(0, Number(q.get("count") ?? 6)).map((id) => {
        const t = titleById(id);
        return { title: t.title, year: String(t.year), media_type: t.type === "tv" ? "show" : "movie", thumb: thumbOf(id), rating_key: String(id * 10), guids: [`tmdb://${id}`] };
      });
      return { recently_added: items };
    }
    case "get_home_stats": {
      const movies = CATALOG.filter((t) => t.type === "movie").slice(0, 5);
      const shows = CATALOG.filter((t) => t.type === "tv").slice(0, 5);
      return [
        { stat_id: "top_movies", rows: movies.map((t, i) => ({ title: t.title, total_plays: 14 - i * 2, thumb: thumbOf(t.tmdbId) })) },
        { stat_id: "top_tv", rows: shows.map((t, i) => ({ title: t.title, total_plays: 31 - i * 4, grandparent_thumb: thumbOf(t.tmdbId) })) },
        { stat_id: "top_users", rows: USERS.slice(0, 5).map((u, i) => ({ friendly_name: u.name, user: u.username, total_plays: 42 - i * 6 })) },
      ];
    }
    case "get_metadata":
      return { guids: [`tmdb://${q.get("rating_key")}`] };
    case "get_geoip_lookup":
      return { city: "Lindenau", region: "Saxony", country: "Germany", code: "DE", latitude: 51.34, longitude: 12.37 };
    case "get_tautulli_info":
      return { tautulli_version: "v2.15.1" };
    default:
      return undefined;
  }
}

// ── Overseerr ───────────────────────────────────────────────────────────────

function overseerrRequest(r, now) {
  const t = titleById(r.tmdbId);
  const u = userById(r.userId);
  const created = iso(now - r.ageHours * HOUR);
  return {
    id: r.id,
    type: t.type,
    status: r.status,
    profileId: 1,
    createdAt: created,
    updatedAt: created,
    seasons: t.type === "tv" ? [{ seasonNumber: 1 }] : undefined,
    media: { id: r.tmdbId - 9000, status: r.mediaStatus, tmdbId: r.tmdbId, mediaType: t.type },
    requestedBy: { id: u.id, displayName: u.name, plexUsername: u.username, email: u.email },
  };
}

/** A discover/search/watchlist result for a catalogue title. */
function overseerrResult(t) {
  const status = mediaStatusOf(t.tmdbId);
  const date = t.year >= new Date().getFullYear() + 1 ? `${t.year}-06-20` : `${t.year}-04-18`;
  return {
    id: t.tmdbId,
    tmdbId: t.tmdbId,
    mediaType: t.type,
    ...(t.type === "tv" ? { name: t.title, firstAirDate: date } : { title: t.title, releaseDate: date }),
    voteAverage: t.rating,
    overview: t.overview,
    posterPath: `/demo-${t.tmdbId}.jpg`,
    mediaInfo: status > 1 ? { status } : undefined,
  };
}

function overseerr(parts, q, ctx) {
  const path = parts.join("/");
  if (path === "request") {
    return { pageInfo: { pages: 1, pageSize: 250, results: REQUESTS.length, page: 1 }, results: REQUESTS.map((r) => overseerrRequest(r, ctx.now)) };
  }
  if (path === "request/count") {
    const count = (fn) => REQUESTS.filter(fn).length;
    return {
      total: REQUESTS.length,
      movie: count((r) => titleById(r.tmdbId).type === "movie"),
      tv: count((r) => titleById(r.tmdbId).type === "tv"),
      pending: count((r) => r.status === 1),
      approved: count((r) => r.status === 2),
      declined: count((r) => r.status === 3),
      processing: count((r) => r.mediaStatus === 3),
      available: count((r) => r.mediaStatus === 5),
    };
  }
  if (path === "status") return { version: "1.34.0" };
  if (path === "user") {
    return { pageInfo: { results: USERS.length + 1 }, results: [ADMIN, ...USERS].map((u) => ({ id: u.id, email: u.email, displayName: u.name, plexUsername: u.username ?? "admin" })) };
  }
  const quota = /^user\/(\d+)\/quota$/.exec(path);
  if (quota) {
    const used = Number(quota[1]) % 4;
    return {
      movie: { limit: 5, days: 7, used, remaining: 5 - used, restricted: false },
      tv: { limit: 3, days: 7, used: used % 3, remaining: 3 - (used % 3), restricted: false },
    };
  }
  if (path === "issue") return { pageInfo: { results: 2 }, results: [{ id: 11, issueType: 1, status: 1 }, { id: 12, issueType: 2, status: 1 }] };
  const media = /^(movie|tv)\/(\d+)$/.exec(path);
  if (media) {
    const t = titleById(media[2]);
    if (!t) return undefined;
    return {
      ...(t.type === "tv" ? { name: t.title, firstAirDate: `${t.year}-04-18`, numberOfSeasons: 2 } : { title: t.title, releaseDate: `${t.year}-04-18` }),
      id: t.tmdbId,
      posterPath: `/demo-${t.tmdbId}.jpg`,
      overview: t.overview,
      mediaInfo: { status: mediaStatusOf(t.tmdbId) },
    };
  }
  const movies = CATALOG.filter((t) => t.type === "movie");
  const shows = CATALOG.filter((t) => t.type === "tv");
  const feed = (list) => ({ page: 1, totalPages: 1, results: list.map(overseerrResult) });
  switch (path) {
    case "discover/trending":
      return feed([CATALOG[3], CATALOG[10], CATALOG[6], CATALOG[11], CATALOG[0], CATALOG[16], CATALOG[7], CATALOG[13]]);
    case "discover/movies":
      return feed(movies.filter((t) => t.tmdbId !== 9110));
    case "discover/tv":
      return feed(shows);
    case "discover/movies/upcoming":
      return feed(movies.filter((t) => t.tmdbId === 9110 || t.tmdbId === 9107));
    case "discover/watchlist":
      return feed([CATALOG[9], CATALOG[12], CATALOG[18]]);
    case "search": {
      const needle = (q.get("query") ?? "").toLowerCase();
      return feed(CATALOG.filter((t) => t.title.toLowerCase().includes(needle)));
    }
    default:
      return undefined;
  }
}

// ── Sonarr / Radarr ─────────────────────────────────────────────────────────

/** Download queue entries; progress loops with the clock (period ≈ 100 / rate seconds). */
const QUEUE = {
  sonarr: [
    { title: "Paper.Cranes.S01E04.1080p.WEB-DL.DDP5.1.H.264-DEMO", size: 1.9 * GiB, base: 22, rate: 0.55 },
    { title: "Signal.Fire.S03E02.2160p.WEB-DL.DDP5.1.HEVC-DEMO", size: 6.4 * GiB, base: 58, rate: 0.35 },
    { title: "Little.Orbit.S02E09.1080p.WEB-DL.AAC2.0.H.264-DEMO", size: 0.8 * GiB, base: 81, rate: 0.7 },
  ],
  radarr: [
    { title: "Ember.and.Static.2025.2160p.WEB-DL.DDP5.1.Atmos.HEVC-DEMO", size: 18.2 * GiB, base: 37, rate: 0.25 },
    { title: "Cobalt.Harvest.2021.1080p.BluRay.x264-DEMO", size: 9.6 * GiB, base: 66, rate: 0.4 },
  ],
};

function arrQueue(svc, elapsedSec) {
  return {
    page: 1,
    pageSize: 20,
    totalRecords: QUEUE[svc].length,
    records: QUEUE[svc].map((r, i) => {
      const pct = (r.base + elapsedSec * r.rate) % 100;
      const etaSec = ((100 - pct) / r.rate) | 0;
      return { id: i + 1, title: r.title, size: r.size, sizeleft: Math.round(r.size * (1 - pct / 100)), timeleft: hms(etaSec), status: "downloading" };
    }),
  };
}

const cover = (id) => [{ coverType: "poster", url: `/MediaCover/${id}/poster.jpg` }];

function sonarrCalendar(now) {
  const rows = [
    [9203, 4, 5, "The Origami Audit", 0.2],
    [9201, 3, 1, "Slack Water", 1],
    [9204, 3, 3, "Whiteout", 1.6],
    [9205, 2, 10, "Perihelion", 2.4],
    [9210, 1, 6, "Understudy's Understudy", 3.3],
    [9202, 2, 1, "First Crack", 4.5],
  ];
  return rows.map(([tmdbId, season, episode, title, days], i) => {
    const t = titleById(tmdbId);
    return {
      id: 300 + i,
      title,
      seasonNumber: season,
      episodeNumber: episode,
      airDateUtc: iso(now + days * DAY),
      monitored: true,
      hasFile: false,
      overview: t.overview,
      series: { title: t.title, titleSlug: t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), images: cover(tmdbId), overview: t.overview, runtime: t.runtime, year: t.year, genres: t.genres, network: t.studio, ratings: { value: t.rating } },
    };
  });
}

function radarrCalendar(now) {
  return [
    [9107, 4.2],
    [9110, 6.1],
    [9105, 2.5],
  ].map(([tmdbId, days], i) => {
    const t = titleById(tmdbId);
    return {
      id: 400 + i,
      title: t.title,
      titleSlug: t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      year: t.year,
      inCinemas: iso(now - 40 * DAY),
      digitalRelease: iso(now + days * DAY),
      images: cover(tmdbId),
      overview: t.overview,
      runtime: t.runtime,
      genres: t.genres,
      studio: t.studio,
      monitored: true,
      hasFile: false,
      ratings: { imdb: { value: t.rating }, tmdb: { value: t.rating } },
    };
  });
}

function arrHistory(svc, now) {
  const ids = svc === "sonarr" ? [9203, 9201, 9204, 9205, 9210, 9202, 9206, 9209] : [9107, 9105, 9104, 9106, 9102, 9108];
  return {
    records: ids.flatMap((tmdbId, i) => {
      const t = titleById(tmdbId);
      const who = svc === "sonarr" ? { series: { title: t.title } } : { movie: { title: t.title } };
      const at = now - (i * 2.1 + 0.4) * HOUR;
      return [
        { id: i * 2 + 1, eventType: "downloadFolderImported", sourceTitle: t.title, date: iso(at), ...who },
        { id: i * 2 + 2, eventType: "grabbed", sourceTitle: t.title, date: iso(at - 0.5 * HOUR), ...who },
      ];
    }),
  };
}

function arr(svc, parts, q, ctx) {
  const path = parts.join("/");
  switch (path) {
    case "api/v3/queue":
      return arrQueue(svc, ctx.elapsedSec);
    case "api/v3/diskspace":
      return [
        { path: "/data/media", label: "Media", freeSpace: Math.round(11.4 * TiB), totalSpace: Math.round(48 * TiB) },
        { path: "/data/downloads", label: "Downloads", freeSpace: Math.round(2.1 * TiB), totalSpace: Math.round(8 * TiB) },
        { path: "/data/archive", label: "Archive", freeSpace: Math.round(4.8 * TiB), totalSpace: Math.round(16 * TiB) },
      ];
    case "api/v3/health":
      return svc === "sonarr"
        ? [{ source: "IndexerStatusCheck", type: "warning", message: "Indexers unavailable due to failures: Northgate (demo)", wikiUrl: "https://wiki.servarr.com/sonarr/system#indexers-are-unavailable-due-to-failures" }]
        : [];
    case "api/v3/calendar":
      return svc === "sonarr" ? sonarrCalendar(ctx.now) : radarrCalendar(ctx.now);
    case "api/v3/history":
      return arrHistory(svc, ctx.now);
    case "api/v3/qualityprofile":
      return [{ id: 1, name: "HD-1080p" }, { id: 2, name: "Ultra-HD" }];
    case "api/v3/system/status":
      return { version: svc === "sonarr" ? "4.0.14.2939" : "5.21.1.9799" };
    case "api/v3/movie":
      if (svc !== "radarr") return undefined;
      return CATALOG.filter((t) => t.type === "movie").map((t) => ({
        tmdbId: t.tmdbId,
        qualityProfileId: t.year >= 2024 ? 2 : 1,
        monitored: true,
        hasFile: mediaStatusOf(t.tmdbId) === 5,
        genres: t.genres,
        studio: t.studio,
        movieFile: mediaStatusOf(t.tmdbId) === 5 ? { size: Math.round((t.year >= 2024 ? 22 : 8) * GiB), quality: { quality: { resolution: t.year >= 2024 ? 2160 : 1080, source: "bluray" } }, mediaInfo: { videoCodec: "h265" } } : undefined,
      }));
    default:
      return undefined;
  }
}

// ── NZBGet ──────────────────────────────────────────────────────────────────

function nzbget(method, ctx) {
  const t = ctx.now / 1000;
  switch (method) {
    case "listgroups":
      return [
        { NZBName: "Brightwater.Station.S01E08.1080p.WEB-DL", FileSizeMB: 2100, RemainingSizeMB: Math.round(1300 - 4 * (ctx.elapsedSec % 300)), Status: "DOWNLOADING" },
        { NZBName: "Dust.and.Honey.S01.COMPLETE.720p.WEB-DL", FileSizeMB: 9800, RemainingSizeMB: 9100, Status: "QUEUED" },
      ];
    case "status":
      return {
        DownloadRate: Math.round((9 + 5 * wobble(t, 3)) * 1_048_576),
        RemainingSizeMB: 11200 - Math.round(ctx.elapsedSec * 1.2),
        DownloadPaused: false,
        ServerStandBy: false,
        DownloadedSizeMB: 482_113,
        PostJobCount: 0,
        FreeDiskSpaceMB: Math.round(2.1 * TiB / 1_048_576),
        UpTimeSec: 38 * 86_400 + Math.round(ctx.elapsedSec),
      };
    default:
      return undefined;
  }
}

// ── Gatus ───────────────────────────────────────────────────────────────────

const gatusGroup = (name) => (["Gatus", "Prometheus", "Tautulli"].includes(name) ? "monitoring" : "media");
const gatusKey = (name) => `${gatusGroup(name)}_${name.toLowerCase()}`;
/** One service blips (a failed check ~3h ago); the rest are clean. */
const BLIP = { NZBGet: 38 };

function gatusStatuses(now) {
  return GATUS_NAMES.map((name, n) => {
    const rand = rng(900 + n);
    const results = Array.from({ length: 50 }, (_, i) => {
      const fail = BLIP[name] === i;
      return {
        status: fail ? 503 : 200,
        success: !fail,
        duration: Math.round((18 + rand() * 60 + (name === "Overseerr" ? 90 : 0)) * 1e6),
        timestamp: iso(now - (49 - i) * 5 * MIN),
      };
    });
    return { name, group: gatusGroup(name), key: gatusKey(name), results };
  });
}

function gatusUptime(parts) {
  const m = /^api\/v1\/endpoints\/(.+)\/uptimes\/(24h|30d)$/.exec(parts.join("/"));
  if (!m) return undefined;
  const blip = Object.keys(BLIP).some((name) => gatusKey(name) === decodeURIComponent(m[1]));
  const ratio = m[2] === "24h" ? (blip ? 0.9965 : 1) : blip ? 0.9981 : 0.9996;
  return String(ratio);
}

// ── Prometheus ──────────────────────────────────────────────────────────────

const RAM = 64 * GiB;
const MOUNTS = [
  { mountpoint: "/mnt/media", device: "/dev/md1", size: 48 * TiB, used: 36.6 * TiB },
  { mountpoint: "/mnt/archive", device: "/dev/md2", size: 16 * TiB, used: 11.2 * TiB },
  { mountpoint: "/mnt/downloads", device: "/dev/nvme1n1p1", size: 8 * TiB, used: 5.9 * TiB },
  { mountpoint: "/", device: "/dev/nvme0n1p2", size: 1 * TiB, used: 0.31 * TiB },
];

/** Value of a node_exporter expression at time `t` (seconds). Series are smooth, bounded waves. */
function promValue(query, t) {
  if (query.includes("node_cpu_seconds_total")) return 14 + 22 * wobble(t, 1);
  if (query.includes("MemAvailable")) return (0.58 + 0.04 * wobble(t, 2)) * RAM;
  if (query.includes("node_network_transmit")) return (46 + 38 * wobble(t, 3)) * 1e6;
  if (query.includes("node_network_receive")) return (118 + 72 * wobble(t, 4)) * 1e6;
  if (query.includes("node_filesystem_size_bytes") && query.includes("avail")) return MOUNTS.reduce((s, m) => s + m.used, 0) + (t % 1000);
  if (query.includes("node_load15")) return 1.5;
  if (query.includes("node_load5")) return 1.7;
  if (query.includes("node_load1")) return 1.1 + 1.6 * wobble(t, 5);
  if (query.includes("node_boot_time_seconds")) return 38 * 86_400 + 5 * 3600;
  if (query.includes("node_memory_MemTotal_bytes")) return RAM;
  if (query.includes("node_memory_SwapTotal_bytes")) return 8 * GiB;
  if (query.includes("node_memory_SwapFree_bytes")) return 7.7 * GiB;
  if (query.includes("node_filesystem_size_bytes")) return MOUNTS.reduce((s, m) => s + m.size, 0);
  return 0;
}

function prometheus(parts, q, ctx) {
  const path = parts.join("/");
  const query = decodeURIComponent(q.get("query") ?? "");
  if (path === "api/v1/label/instance/values") return { status: "success", data: ["media-01:9100"] };
  if (path === "api/v1/query") {
    // Per-mount vectors carry the mountpoint label; everything else is a single sample.
    const perMount = /^node_filesystem_(size|avail)_bytes/.exec(query);
    if (perMount) {
      const result = MOUNTS.map((m) => ({ metric: { mountpoint: m.mountpoint, device: m.device, fstype: "xfs" }, value: [ctx.now / 1000, String(perMount[1] === "size" ? m.size : m.size - m.used)] }));
      return { status: "success", data: { resultType: "vector", result } };
    }
    return { status: "success", data: { resultType: "vector", result: [{ metric: {}, value: [ctx.now / 1000, String(promValue(query, ctx.now / 1000))] }] } };
  }
  if (path === "api/v1/query_range") {
    const start = Number(q.get("start"));
    const end = Number(q.get("end"));
    const step = Number(q.get("step")) || 60;
    const values = [];
    for (let t = start; t <= end; t += step) values.push([t, String(promValue(query, t))]);
    return { status: "success", data: { resultType: "matrix", result: [{ metric: {}, values }] } };
  }
  return undefined;
}

// ── Server ──────────────────────────────────────────────────────────────────

const SERVICE_IDS = new Set(SERVICES.map((s) => s.id));

/**
 * Start the fake upstream on 127.0.0.1. `port` 0 picks a free one. `clock` is injectable so
 * tests can pin time. Resolves to `{ url, port, close() }`; `url` has no trailing slash.
 */
export async function startUpstream({ port = 0, clock = Date.now } = {}) {
  const startedAt = clock();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const [, svc, ...parts] = url.pathname.split("/").map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
    const ctx = { now: clock(), elapsedSec: (clock() - startedAt) / 1000 };
    const q = url.searchParams;

    const json = (body, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const image = ({ contentType, body }) => {
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      res.end(body);
    };
    const notFound = () => json({ error: "not found", path: url.pathname }, 404);

    if (!svc || !SERVICE_IDS.has(svc)) return notFound();

    try {
      // Artwork first: Tautulli's image proxy and the *arr MediaCover paths.
      if (svc === "tautulli" && q.get("cmd") === "pms_image_proxy") {
        const img = q.get("img") ?? "";
        const kind = q.get("fallback") === "art" ? "backdrop" : "poster";
        const avatar = /^\/users\/(\d+)\/avatar/.exec(img);
        return image(avatar ? avatarForUser(avatar[1]) : posterForRef(img, kind));
      }
      if ((svc === "sonarr" || svc === "radarr") && parts[0] === "MediaCover") return image(posterForRef(parts.join("/")));
      if (svc === "overseerr" && parts[0] === "images") return image(posterForRef(parts.join("/")));

      let data;
      if (svc === "tautulli" && parts.join("/") === "api/v2") {
        data = tautulli(q.get("cmd"), q, ctx);
        if (data !== undefined) return json({ response: { result: "success", message: null, data } });
      } else if (svc === "overseerr" && parts[0] === "api" && parts[1] === "v1") {
        data = overseerr(parts.slice(2), q, ctx);
      } else if ((svc === "sonarr" || svc === "radarr") && parts[0] === "api") {
        data = arr(svc, parts, q, ctx);
      } else if (svc === "nzbget" && parts.join("/") === "jsonrpc" && req.method === "POST") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const result = nzbget(JSON.parse(raw || "{}").method, ctx);
        if (result !== undefined) return json({ version: "1.1", result });
      } else if (svc === "gatus" && parts[0] === "api") {
        if (parts.join("/") === "api/v1/endpoints/statuses") data = gatusStatuses(ctx.now);
        else {
          const text = gatusUptime(parts);
          if (text !== undefined) {
            res.writeHead(200, { "Content-Type": "text/plain" });
            return res.end(text);
          }
        }
      } else if (svc === "prometheus") {
        data = prometheus(parts, q, ctx);
      }
      return data === undefined ? notFound() : json(data);
    } catch (err) {
      return json({ error: String(err?.message ?? err) }, 500);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const actual = server.address().port;

  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
