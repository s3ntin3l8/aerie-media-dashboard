"use client";
// ============================================================
// AERIE — dashboard panels (committed defaults: spotlight central,
// stripe tiles, heartbeat status). Variant switchers from the
// design-time Tweaks panel were intentionally dropped.
// ============================================================
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Role, Service, ServiceStatus, DiscoverItem, RequestStatus } from "@/lib/types";
import { useData, useSnapshotTime } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { isVisible } from "@/lib/visibility";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";
import {
  Icon,
  Pill,
  Eyebrow,
  StatusDot,
  Heartbeat,
  Equalizer,
  ProgressBar,
  PosterTile,
  Avatar,
  catColor,
} from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import {
  statusColor as _statusColor,
  statusWord as _statusWord,
  uptimeText as _uptimeText,
  REQ_TONE as _REQ_TONE,
  REQ_LABEL as _REQ_LABEL,
} from "@/lib/display";
import { useStreamProgress } from "@/components/hooks/useStreamProgress";
import { StreamQuality, StreamClient, StreamNetwork, StreamMeta, StreamTech, StreamAvatar } from "@/components/streams/StreamDetail";

type CSS = React.CSSProperties;

// shared ticking clock (epoch ms) for live progress
export function useTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Human-readable byte size ("1.4 TB", "820 GB", "512 MB", "—" for null). */
export function fmtBytes(b: number | null | undefined): string {
  if (b == null) return "—";
  const tb = b / 1_099_511_627_776;
  if (tb >= 1) return `${tb.toFixed(1)} TB`;
  const gb = b / 1_073_741_824;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(b / 1_048_576).toFixed(0)} MB`;
}

/** Relative day label for an upcoming ISO date ("Today", "Tomorrow", "Mon 5"). */
export function fmtDay(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

/** Compact "time ago" for an ISO timestamp (e.g. "3h ago", "2d ago"). */
export function timeAgo(iso: string | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function fmtTime(totalSec: number) {
  totalSec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(totalSec / 3600),
    m = Math.floor((totalSec % 3600) / 60),
    s = totalSec % 60;
  const mm = String(m).padStart(2, "0"),
    ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const len = items.length;
  useEffect(() => { setPage(0); }, [len]);
  const totalPages = Math.max(1, Math.ceil(len / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = items.slice(safePage * pageSize, (safePage + 1) * pageSize);
  return { page: safePage, totalPages, slice, setPage };
}

function PageControls({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        onClick={() => setPage(page - 1)}
        disabled={page === 0}
        style={{
          background: "none",
          border: "none",
          padding: "2px 3px",
          cursor: page === 0 ? "default" : "pointer",
          color: page === 0 ? "var(--on-surface-variant)" : "var(--primary)",
          opacity: page === 0 ? 0.35 : 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Icon name="chevron_left" size={14} />
      </button>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--on-surface-variant)",
          minWidth: 28,
          textAlign: "center",
        }}
      >
        {page + 1} / {totalPages}
      </span>
      <button
        onClick={() => setPage(page + 1)}
        disabled={page >= totalPages - 1}
        style={{
          background: "none",
          border: "none",
          padding: "2px 3px",
          cursor: page >= totalPages - 1 ? "default" : "pointer",
          color: page >= totalPages - 1 ? "var(--on-surface-variant)" : "var(--primary)",
          opacity: page >= totalPages - 1 ? 0.35 : 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Icon name="chevron_right" size={14} />
      </button>
    </div>
  );
}

export function PanelShell({
  title,
  icon,
  accent = "var(--on-surface-variant)",
  count,
  action,
  children,
  style,
  bodyStyle,
  live,
  fill,
}: {
  title: string;
  icon?: string;
  accent?: string;
  count?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  style?: CSS;
  bodyStyle?: CSS;
  live?: boolean;
  /** When true, fill the parent's height (for grid tiles) and scroll the body internally. */
  fill?: boolean;
}) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-container-lowest)",
        border: "1px solid var(--outline-variant)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
        height: fill ? "100%" : undefined,
        ...style,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 16px 8px",
          borderBottom: "1px solid color-mix(in srgb, var(--outline-variant) 60%, transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          {icon && <Icon name={icon} size={16} color={accent} />}
          <h2 style={{ fontFamily: "var(--font-headline)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--on-surface)", whiteSpace: "nowrap" }}>
            {title}
          </h2>
          {live && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "var(--error)" }}>
              <StatusDot status="up" size={6} />
              LIVE
            </span>
          )}
          {count != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>{count}</span>}
        </div>
        {action}
      </header>
      <div
        className={fill ? "custom-scrollbar" : undefined}
        style={{ flex: 1, ...(fill ? { minHeight: 0, overflowY: "auto" } : {}), ...bodyStyle }}
      >
        {children}
      </div>
    </section>
  );
}

export function Empty({ icon, line, sub }: { icon: string; line: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "32px 16px", textAlign: "center" }}>
      <Icon name={icon} size={28} color="color-mix(in srgb, var(--on-surface-variant) 55%, transparent)" />
      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--on-surface)" }}>{line}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--on-surface-variant)", maxWidth: 220 }}>{sub}</div>}
    </div>
  );
}

const SeeAll = ({ onClick }: { onClick?: () => void }) => (
  <a onClick={onClick} style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 2, color: "var(--primary)", cursor: "pointer", fontWeight: 500 }}>
    see all <Icon name="arrow_right_alt" size={14} />
  </a>
);

// ── NOW PLAYING ───────────────────────────────────────────

// Inner row extracted so the hook can be called once per stream item.
function StreamRow({ s, i, big, role, allServices, users }: { s: import("@/lib/types").NowPlaying; i: number; big?: boolean; role: Role; allServices: Service[]; users: import("@/lib/types").User[] }) {
  const { cur, pct } = useStreamProgress(s);
  const svc = allServices.find((x) => x.id === s.src);
  const c = catColor("stream");
  const u = users.find((x) => x.id === s.user);
  const accent = s.src === "plex" ? "var(--originator-third-party)" : "var(--primary)";
  // "0" bitrate / "—" codec mean the source doesn't report them (e.g. Audiobookshelf):
  // show only what's real, falling back to the audio codec for audio-only sessions.
  const rateCodec = [s.bitrate !== "0" ? `${s.bitrate} Mbps` : null, s.codec !== "—" ? s.codec : s.audioCodec].filter(Boolean).join(" · ");
  return (
    <div style={{ position: "relative", display: "flex", gap: 13, padding: big ? "15px 16px" : "12px 16px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)" : "none" }}>
      <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 9999, background: accent }} />
      {/* audio covers (ABS books, albums) are square; video posters 2:3 */}
      <PosterTile title={s.title} kind={s.kind} cat="stream" w={big ? 50 : 42} ratio={s.kind === "track" ? 1 : 1.5} art={s.art} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
          <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: big ? 15 : 13.5, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {s.title}
          </span>
          {s.paused ? <Icon name="pause_circle" size={14} color="var(--on-surface-variant)" /> : s.kind === "track" ? <Equalizer color={c} h={11} /> : null}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--on-surface-variant)", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.ep || (s.kind === "movie" ? s.year : "")}
          {s.ep || s.year ? " · " : ""}
          {s.device}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", minWidth: 38 }}>{fmtTime(cur)}</span>
          <div style={{ flex: 1 }}>
            <ProgressBar pct={pct} color={accent} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", minWidth: 38, textAlign: "right" }}>{fmtTime(s.dur * 60)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {role === "admin" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Avatar name={u ? u.name : s.user} src={s.userAvatar ?? u?.avatar} size={16} color={accent} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--on-surface)" }}>{u ? u.name : s.user}</span>
            </span>
          )}
          {s.res !== "—" && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "color-mix(in srgb, var(--on-surface-variant) 12%, transparent)", color: "var(--on-surface-variant)" }}>{s.res}</span>
          )}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 700,
              background: `color-mix(in srgb, ${s.play === "transcode" ? "var(--amber)" : "var(--originator-own)"} 14%, transparent)`,
              color: s.play === "transcode" ? "var(--amber)" : "var(--originator-own)",
            }}
          >
            {s.play === "transcode" ? `TRANSCODE${s.hwTranscode != null ? (s.hwTranscode ? " · HW" : " · SW") : ""}` : "DIRECT"}
          </span>
          {rateCodec && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
              {rateCodec}
            </span>
          )}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--on-surface-variant)" }}>
            {s.location && (
              <span title={s.relayed ? "Relayed" : s.location.toUpperCase()} style={{ display: "inline-flex" }}>
                <Icon name={s.relayed ? "vpn_lock" : s.local || s.location === "lan" ? "lan" : "public"} size={12} color="var(--on-surface-variant)" />
              </span>
            )}
            {svc ? <ServiceLogo service={svc} size={14} radius={3} /> : <Icon name="play_circle" size={12} color={catColor("stream")} />}
            {svc?.name ?? s.src}
          </span>
        </div>
      </div>
    </div>
  );
}

export function NowPlayingPanel({ role, big, onAll, fill }: { role: Role; big?: boolean; onAll?: () => void; fill?: boolean }) {
  const { nowPlaying, services: allServices, users } = useData();
  const { user } = usePortal();
  // NOTE: NowPlaying uses Plex/Jellyfin identity, not portal ids — this filter is a
  // placeholder until that identity is linked (see plan "Out of scope"). Currently
  // matches nothing for non-admins, same as before.
  const visible = role !== "admin" ? nowPlaying.filter((s) => s.user === user.id) : nowPlaying;
  return (
    <PanelShell
      fill={fill}
      title={role === "admin" ? "Now Playing" : "Your Session"}
      icon="play_circle"
      accent="var(--primary)"
      live={visible.length > 0}
      count={role === "admin" ? `${visible.length} active` : undefined}
      action={role === "admin" ? <SeeAll onClick={onAll} /> : undefined}
    >
      {visible.length === 0 ? (
        <Empty icon="play_disabled" line="Nothing playing" sub="Your active stream will appear here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {visible.map((s, i) => (
            <StreamRow key={s.id} s={s} i={i} big={big} role={role} allServices={allServices} users={users} />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ── Rich session card (full Now Playing page) ─────────────────
// Expands a single stream into its full story: a big cover anchors the left and
// stretches to the connection footer, with the title, quality and transcode
// spec grid reflowed into the right column. A wide backdrop/fanart image fills
// the card behind a light scrim. Reuses the shared StreamDetail fragments
// (which degrade to nothing on missing data); a missing/failed backdrop degrades
// to the plain surface, so the layout never depends on the image loading.

// Hairline section divider used to group the card's rows.
const DIVIDER = "1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)";

// Backdrop image layer: the art is softly blurred (enough to kill local contrast
// while keeping the fanart recognizable; the scale-up hides the blur's edge
// vignette inside the overflow:hidden wrapper) under a strong vertical scrim, so
// every text band stays legible on any fanart in both themes. The scrim still
// turns fully solid near the bottom so the card's footer rows sit on plain surface.
const SCRIM =
  "linear-gradient(180deg, color-mix(in srgb, var(--surface-container) 32%, transparent) 0%, color-mix(in srgb, var(--surface-container) 54%, transparent) 34%, color-mix(in srgb, var(--surface-container) 82%, transparent) 64%, var(--surface-container) 86%)";
function Backdrop({ src }: { src?: string }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "inherit" }}>
      {src && imgOk && (
        <img
          src={src}
          alt=""
          aria-hidden
          loading="lazy"
          onError={() => setImgOk(false)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(12px) saturate(1.2)", transform: "scale(1.08)" }}
        />
      )}
      <div style={{ position: "absolute", inset: 0, background: SCRIM }} />
    </div>
  );
}

// Big "fill" poster for the band layout: stretches to its flex row's height
// (alignSelf: stretch) so the cover spans the whole card, the art cropped to
// fill. Degrades to the same tinted-gradient + glyph as PosterTile.
function PosterFill({ s, w }: { s: import("@/lib/types").NowPlaying; w: number }) {
  const c = catColor("stream");
  const glyph = s.kind === "series" ? "live_tv" : s.kind === "track" ? "album" : "movie";
  const [imgOk, setImgOk] = useState(true);
  return (
    <div
      style={{
        width: w,
        alignSelf: "stretch",
        minHeight: Math.round(w * 1.5),
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        background: `linear-gradient(160deg, color-mix(in srgb, ${c} 26%, var(--surface-container)) 0%, var(--surface-container-high) 100%)`,
        border: "1px solid color-mix(in srgb, var(--outline-variant) 70%, transparent)",
        boxShadow: "0 8px 24px rgba(0,0,0,.5)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={glyph} size={Math.round(w * 0.34)} color={`color-mix(in srgb, ${c} 75%, var(--on-surface-variant))`} />
      </div>
      {s.art && imgOk && (
        <img src={s.art} alt={s.title} loading="lazy" onError={() => setImgOk(false)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </div>
  );
}

export function StreamCard({ s, role, allServices, users }: { s: import("@/lib/types").NowPlaying; role: Role; allServices: Service[]; users: import("@/lib/types").User[] }) {
  const { cur, pct } = useStreamProgress(s);
  const svc = allServices.find((x) => x.id === s.src);
  const c = catColor("stream");
  const u = users.find((x) => x.id === s.user);
  const accent = s.src === "plex" ? "var(--originator-third-party)" : "var(--primary)";
  const hasBg = Boolean(s.backdrop);
  // Audio sessions (audiobooks, podcasts, music) carry far fewer facts than video
  // streams, so they get a compact variant: square cover, one condensed footer row.
  const isAudio = s.kind === "track";

  // Title block: name, season·episode/year/rating/genres meta, device, user.
  const titleBlock = (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 18, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.title}
        </span>
        {s.paused ? <Icon name="pause_circle" size={16} color="var(--on-surface-variant)" /> : s.kind === "track" ? <Equalizer color={c} h={12} /> : null}
      </div>
      {s.ep && (
        <div style={{ fontSize: 13, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.ep}</div>
      )}
      {s.narrator && (
        <div style={{ fontSize: 11.5, color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Read by {s.narrator}</div>
      )}
      <StreamMeta s={s} />
      <div style={{ fontSize: 12, color: "var(--on-surface)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        <Icon name="devices" size={12} color="var(--on-surface-variant)" />
        {s.device}
      </div>
      {role === "admin" && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 1 }}>
          <StreamAvatar s={s} size={18} color={accent} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--on-surface)" }}>{u ? u.name : s.user}</span>
        </span>
      )}
    </div>
  );

  const serviceTag = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--on-surface-variant)", flexShrink: 0 }}>
      {svc ? <ServiceLogo service={svc} size={15} radius={3} /> : <Icon name="play_circle" size={13} color={c} />}
      {svc?.name ?? s.src}
    </span>
  );

  // Card sections, composed differently per layout.
  const progressRow = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: accent, minWidth: 40 }}>{fmtTime(cur)}</span>
      <div style={{ flex: 1 }}>
        <ProgressBar pct={pct} color={accent} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface)", minWidth: 40, textAlign: "right" }}>{fmtTime(s.dur * 60)}</span>
    </div>
  );

  const playChip = (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        padding: "1px 6px",
        borderRadius: 4,
        fontWeight: 700,
        background: `color-mix(in srgb, ${s.play === "transcode" ? "var(--amber)" : "var(--originator-own)"} 14%, transparent)`,
        color: s.play === "transcode" ? "var(--amber)" : "var(--originator-own)",
      }}
    >
      {s.play === "transcode" ? "TRANSCODE" : "DIRECT"}
    </span>
  );

  // stream: play-mode + quality headline, then the transcode spec grid
  const streamSection = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 11, borderTop: DIVIDER }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {playChip}
        <StreamQuality s={s} />
      </div>
      <StreamTech s={s} />
    </div>
  );

  // connection: client + network
  const connectionSection = (s.product || s.platform || s.qualityProfile || s.location || s.geo || s.ipPublic) ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 11, borderTop: DIVIDER }}>
      <StreamClient s={s} />
      <StreamNetwork s={s} />
    </div>
  ) : null;

  // Audio variant: everything below the progress bar condenses into one wrap row
  // (play mode · quality · codec grid · client · network) — audio sessions have
  // no video spec grid to justify the stacked sections.
  const audioFooter = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 11, borderTop: DIVIDER }}>
      {playChip}
      <StreamQuality s={s} />
      <StreamTech s={s} />
      <StreamClient s={s} />
      <StreamNetwork s={s} />
    </div>
  );

  // Big cover on the left that stretches down to the connection footer, with the
  // content reflowed into the right column. The backdrop fills the card behind a
  // light scrim (art visible up top, solid before the footer); the header sits
  // up in the art. A missing/failed backdrop degrades to the plain surface.
  return (
    <div
      style={{
        position: "relative",
        background: "var(--surface-container)",
        border: "1px solid color-mix(in srgb, var(--outline-variant) 60%, transparent)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {hasBg && <Backdrop src={s.backdrop} />}
      {/* service tag pinned to the art on a subtle scrim pill for legibility */}
      {hasBg && (
        <div style={{ position: "absolute", top: 14, right: 14, zIndex: 2, padding: "3px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--surface-container) 80%, transparent)", backdropFilter: "blur(8px)" }}>
          {serviceTag}
        </div>
      )}
      <div style={{ position: "relative", padding: 16, display: "flex", flexDirection: "column", gap: 13 }}>
        <span style={{ position: "absolute", left: 0, top: 2, bottom: 2, width: 3, borderRadius: 9999, background: accent }} />
        {/* main: cover left, content column right. Video gets the big stretching
            poster; audio a fixed square cover (ABS/album art is square). */}
        <div style={{ display: "flex", gap: 16, alignItems: isAudio ? "flex-start" : "stretch" }}>
          {isAudio ? (
            <PosterTile title={s.title} kind={s.kind} cat="stream" w={132} ratio={1} rounded={12} art={s.art} />
          ) : (
            <PosterFill s={s} w={196} />
          )}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {titleBlock}
              {!hasBg && serviceTag}
            </div>
            {progressRow}
            {isAudio ? audioFooter : streamSection}
          </div>
        </div>
        {!isAudio && connectionSection}
      </div>
    </div>
  );
}

// Summary strip for the full Now Playing page: stream count, transcode mix,
// and aggregate bandwidth (from the snapshot's `bandwidth`, already fetched).
function SummaryStat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 800, color: color ?? "var(--on-surface)" }}>{value}</span>
      <span style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--on-surface-variant)" }}>{label}</span>
    </div>
  );
}

export function StreamsSummary({ streams }: { streams: import("@/lib/types").NowPlaying[] }) {
  const { bandwidth } = useData();
  const transcoding = streams.filter((s) => s.play === "transcode").length;
  const direct = streams.length - transcoding;
  const wan = streams.filter((s) => s.location === "wan" || (s.local === false && s.location !== "lan")).length;
  return (
    <div
      style={{
        display: "flex",
        gap: 26,
        flexWrap: "wrap",
        padding: "14px 18px",
        background: "var(--surface-container-low)",
        border: "1px solid color-mix(in srgb, var(--outline-variant) 60%, transparent)",
        borderRadius: 14,
        marginBottom: 14,
      }}
    >
      <SummaryStat value={String(streams.length)} label="Streaming" color="var(--primary)" />
      <SummaryStat value={String(transcoding)} label="Transcoding" color={transcoding ? "var(--amber)" : undefined} />
      <SummaryStat value={String(direct)} label="Direct" color={direct ? "var(--originator-own)" : undefined} />
      {wan > 0 && <SummaryStat value={String(wan)} label="Remote (WAN)" />}
      {bandwidth && <SummaryStat value={`${bandwidth.totalMbps.toFixed(1)}`} label="Mbps total" />}
      {bandwidth && bandwidth.wanMbps > 0 && <SummaryStat value={`${bandwidth.wanMbps.toFixed(1)}`} label="Mbps WAN" />}
    </div>
  );
}

// Full Now Playing page body: summary strip + rich session cards (or empty state).
export function StreamsView({ role }: { role: Role }) {
  const { nowPlaying, services: allServices, users } = useData();
  const { user } = usePortal();
  const visible = role !== "admin" ? nowPlaying.filter((s) => s.user === user.id) : nowPlaying;
  if (visible.length === 0) {
    // The page (views/Streams.tsx) already renders a PageHeader title, so render
    // the empty state bare — no second PanelShell title.
    return (
      <Empty icon="play_disabled" line="Nothing playing" sub="Active streams will appear here with full transcode, quality, client and network detail." />
    );
  }
  return (
    <div>
      {role === "admin" && <StreamsSummary streams={visible} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {visible.map((s) => (
          <StreamCard key={s.id} s={s} role={role} allServices={allServices} users={users} />
        ))}
      </div>
    </div>
  );
}

// ── SERVICE TILES (stripe) ─────────────────────────────────
export function ServiceTiles({ role, onOpen, onAll, services, fill, serviceIds }: { role: Role; onOpen?: (s: Service) => void; onAll?: () => void; services?: Service[]; fill?: boolean; serviceIds?: string }) {
  const visibleServices = useVisibleServices("launcher");
  // Allow an explicit `services` prop override (e.g. admin panel passes a pre-filtered list).
  let list = services ?? visibleServices;
  if (serviceIds && serviceIds.length > 0) {
    // serviceIds is an ordered list of visible ids — filter to those, then honor that order.
    const order = serviceIds.split(",").filter(Boolean);
    const pos = new Map(order.map((id, i) => [id, i]));
    list = list.filter((s) => pos.has(s.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  }

  const Tile = ({ s }: { s: Service }) => {
    const c = catColor(s.cat);
    return (
      <a
        onClick={() => onOpen?.(s)}
        title={s.note}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 14,
          borderRadius: 12,
          cursor: "pointer",
          textDecoration: "none",
          background: "var(--surface-container-lowest)",
          border: "1px solid var(--outline-variant)",
          transition: "border-color .18s, transform .1s, box-shadow .18s",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = `color-mix(in srgb, ${c} 55%, transparent)`;
          e.currentTarget.style.boxShadow = `0 0 0 3px color-mix(in srgb, ${c} 8%, transparent)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--outline-variant)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <ServiceLogo service={s} size={36} radius={9} />
          <Icon name={s.embeddable ? "open_in_full" : "open_in_new"} size={14} color="var(--on-surface-variant)" />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 13.5, color: "var(--on-surface)" }}>{s.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <StatusDot status={s.status} size={6} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>
              {s.status === "up" ? `${s.uptime.toFixed(2)}%` : s.status === "unknown" ? "no data" : statusWord(s.status).toLowerCase()}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", marginLeft: "auto" }}>{s.ms}ms</span>
          </div>
        </div>
      </a>
    );
  };

  return (
    <PanelShell fill={fill} title="Services" icon="apps" count={`${list.length}`} action={onAll ? <SeeAll onClick={onAll} /> : undefined} bodyStyle={fill ? undefined : { padding: 14 }}>
      {list.length === 0 ? (
        <Empty icon="apps" line="No services yet" sub="Add services in Admin to launch them here." />
      ) : fill ? (
        <FlowGrid items={list} itemW={150} itemH={118} gap={11} padX={14} padY={14} stretch render={(s) => <Tile key={s.id} s={s} />} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 11 }}>
          {list.map((s) => (
            <Tile key={s.id} s={s} />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ── CENTRAL SERVICES SPOTLIGHT ─────────────────────────────
// Re-export from lib/display (source of truth) for backward compat.
export const statusColor = _statusColor;
export const statusWord = _statusWord;
export const uptimeText = _uptimeText;

function HeartbeatStrip({ beats, h = 24 }: { beats: number[]; h?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: h, width: "100%" }}>
      {beats.map((b, i) => {
        const st: ServiceStatus = b === 0 ? "down" : b === 0.5 ? "degraded" : b < 0 ? "unknown" : "up";
        return (
          <span
            key={i}
            title={st === "unknown" ? "no data" : st}
            style={{ flex: 1, minWidth: 0, height: b < 0 ? "30%" : b === 0.5 ? "62%" : "100%", minHeight: 5, background: statusColor(st), opacity: b < 0 ? 0.4 : b === 0 ? 0.92 : 0.8, borderRadius: 1.5 }}
          />
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  const c = statusColor(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 9px",
        borderRadius: 9999,
        background: `color-mix(in srgb, ${c} 13%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      <StatusDot status={status} size={6} />
      <span style={{ fontFamily: "var(--font-body)", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.11em", color: c }}>{statusWord(status)}</span>
    </span>
  );
}

function CentralCard({ s, onOpen }: { s: Service; onOpen?: (s: Service) => void }) {
  const c = catColor(s.cat);
  const sc = statusColor(s.status);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: "18px 18px 16px",
        overflow: "hidden",
        background: "var(--surface-container-lowest)",
        border: "1px solid var(--outline-variant)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sc }} />
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
        <ServiceLogo service={s} size={40} radius={11} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 16, color: "var(--on-surface)" }}>{s.name}</span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c, padding: "1px 6px", borderRadius: 4, background: `color-mix(in srgb, ${c} 12%, transparent)` }}>
              {s.centralLabel}
            </span>
          </div>
          <a
            href={`https://${s.host}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open https://${s.host} in a new tab`}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", cursor: "pointer" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--primary)";
              e.currentTarget.style.textDecoration = "underline";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--on-surface-variant)";
              e.currentTarget.style.textDecoration = "none";
            }}
          >
            {s.host}
          </a>
        </div>
        <StatusBadge status={s.status} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 34, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--on-surface)", fontVariantNumeric: "tabular-nums" }}>
            {s.status === "unknown" ? (
              "—"
            ) : (
              <>
                {s.uptime.toFixed(2)}
                <span style={{ fontSize: 18, color: "var(--on-surface-variant)", marginLeft: 1 }}>%</span>
              </>
            )}
          </div>
          <Eyebrow style={{ marginTop: 6 }}>30-day uptime</Eyebrow>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--outline-variant)", margin: "3px 0" }} />
        <div>
          <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 22, lineHeight: 1, letterSpacing: "-0.01em", color: "var(--on-surface)", fontVariantNumeric: "tabular-nums" }}>
            {s.status === "unknown" ? (
              "—"
            ) : (
              <>
                {s.ms}
                <span style={{ fontSize: 13, color: "var(--on-surface-variant)", marginLeft: 1 }}>ms</span>
              </>
            )}
          </div>
          <Eyebrow style={{ marginTop: 6 }}>Response</Eyebrow>
        </div>
      </div>

      <HeartbeatStrip beats={s.beats} h={24} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
        <span style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>
          {s.lastIncidentAt ? `Last incident ${timeAgo(s.lastIncidentAt)}` : "Last 30 days"} · v{String(s.version).replace(/^v/i, "")}
        </span>
        {s.embeddable ? (
          <a onClick={() => onOpen?.(s)} style={{ fontSize: 11.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3, color: "var(--primary)", cursor: "pointer" }}>
            Open <Icon name="arrow_right_alt" size={14} />
          </a>
        ) : (
          <a href={`https://${s.host}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3, color: "var(--primary)", cursor: "pointer", textDecoration: "none" }}>
            Launch <Icon name="open_in_new" size={14} />
          </a>
        )}
      </div>
    </div>
  );
}

export function CentralServices({ onOpen, onAll, fill }: { role?: Role; onOpen?: (s: Service) => void; onAll?: () => void; fill?: boolean }) {
  const { services, visibility } = useData();
  const { role } = usePortal();
  const list = services.filter((s) => s.central && isVisible(s.id, role, visibility));
  // In the modular grid (fill) a tile is absolutely positioned, so returning null
  // would leave an empty hole — render a graceful empty card instead.
  if (list.length === 0)
    return fill ? (
      <PanelShell fill title="Central Services" icon="verified" accent="var(--originator-own)">
        <Empty icon="verified" line="No central services" sub="Mark core services as “central” to feature them here." />
      </PanelShell>
    ) : null;
  const down = list.filter((s) => s.status === "down");
  const deg = list.filter((s) => s.status === "degraded");
  const unknown = list.filter((s) => s.status === "unknown");
  const allGood = down.length === 0 && deg.length === 0 && unknown.length === 0;
  const headline = allGood
    ? "All core services are up — stream away."
    : down.length
      ? `${down.map((s) => s.name).join(", ")} ${down.length > 1 ? "are" : "is"} down — streaming affected.`
      : deg.length
        ? `${deg.map((s) => s.name).join(", ")} degraded — playback may be slow.`
        : "Health unknown — connect Gatus to monitor uptime.";
  const hc = allGood ? "var(--originator-own)" : down.length ? "var(--error)" : deg.length ? "var(--amber)" : "var(--on-surface-variant)";

  return (
    <div style={fill ? { height: "100%", display: "flex", flexDirection: "column" } : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: `color-mix(in srgb, ${hc} 13%, transparent)`, flexShrink: 0 }}>
          <Icon name={allGood ? "verified" : down.length || deg.length ? "warning" : "help"} size={18} color={hc} fill={allGood} />
        </div>
        <div style={{ minWidth: 0 }}>
          <Eyebrow color="var(--primary)" style={{ marginBottom: 2 }}>
            Central services
          </Eyebrow>
          <div style={{ fontFamily: "var(--font-headline)", fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.01em", color: "var(--on-surface)" }}>{headline}</div>
        </div>
        {onAll && (
          <a onClick={onAll} style={{ marginLeft: "auto", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 2, color: "var(--primary)", cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}>
            all status <Icon name="arrow_right_alt" size={14} />
          </a>
        )}
      </div>
      <div
        className={fill ? "custom-scrollbar" : undefined}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(248px, 1fr))", gap: 14, ...(fill ? { flex: 1, minHeight: 0, overflowY: "auto" } : {}) }}
      >
        {list.map((s) => (
          <CentralCard key={s.id} s={s} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

// ── STATUS (heartbeat) ─────────────────────────────────────
export function StatusPanel({ role, onAll, fill }: { role: Role; onAll?: () => void; fill?: boolean }) {
  const list = useVisibleServices("status");
  const up = list.filter((s) => s.status === "up").length;
  const deg = list.filter((s) => s.status === "degraded").length;
  const down = list.filter((s) => s.status === "down").length;
  const unknown = list.filter((s) => s.status === "unknown").length;

  return (
    <PanelShell
      fill={fill}
      title="System Status"
      icon="favorite"
      accent="var(--originator-own)"
      action={<SeeAll onClick={onAll} />}
      count={
        <span style={{ display: "inline-flex", gap: 8 }}>
          <span style={{ color: "var(--originator-own)" }}>{up} up</span>
          {deg > 0 && <span style={{ color: "var(--amber)" }}>{deg} degraded</span>}
          {down > 0 && <span style={{ color: "var(--error)" }}>{down} down</span>}
          {unknown > 0 && <span style={{ color: "var(--on-surface-variant)" }}>{unknown} no data</span>}
        </span>
      }
    >
      {list.length === 0 ? (
        <Empty icon="favorite_border" line="No services" sub="Add services in Admin." />
      ) : (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {list.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 16px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
            <StatusDot status={s.status} size={7} />
            <div style={{ minWidth: 0, flex: "0 0 96px" }}>
              <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center", overflow: "hidden" }}>
              <Heartbeat beats={s.beats.slice(-18)} h={18} barW={3} gap={1.5} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: s.status === "down" ? "var(--error)" : s.status === "degraded" ? "var(--amber)" : "var(--on-surface-variant)", minWidth: 48, textAlign: "right" }}>
              {uptimeText(s)}
            </span>
          </div>
        ))}
      </div>
      )}
    </PanelShell>
  );
}

// ── MY REQUESTS (compact) ──────────────────────────────────
// Re-export from lib/display (source of truth) for backward compat.
export const REQ_TONE = _REQ_TONE;
export const REQ_LABEL = _REQ_LABEL;

export function MyRequestsPanel({ role, onAll, onAct, fill, limit, view, dense, title }: { role: Role; onAll?: () => void; onAct?: (id: string, action: "approve" | "decline") => void; fill?: boolean; limit?: number; view?: string; dense?: boolean; title?: string }) {
  const { users, requests } = useData();
  const { user } = usePortal();
  const me = users.find((u) => u.id === user.id) ?? users[0];
  const mine = requests.filter((r) => r.portalUser === user.id);
  const queue = requests.filter((r) => r.status === "pending");
  const adminMode = view === "queue" && role === "admin" ? true : view === "mine" ? false : role === "admin";
  const items = (adminMode ? queue : mine).slice(0, limit ?? 5);
  const rowPadding = dense ? "6px 16px" : "10px 16px";
  const defaultTitle = adminMode ? "Approval Queue" : "My Requests";
  return (
    <PanelShell
      fill={fill}
      title={title && title.length > 0 ? title : defaultTitle}
      icon={adminMode ? "inbox" : "bookmark_added"}
      accent="var(--originator-court)"
      count={adminMode ? `${queue.length} pending` : undefined}
      action={<SeeAll onClick={onAll} />}
    >
      {!adminMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)" }}>
          <Eyebrow>Quota</Eyebrow>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            {me.movieQuota && <ProgressBar pct={me.movieQuota.limit ? Math.min(100, (me.movieQuota.used / me.movieQuota.limit) * 100) : 0} color={me.movieQuota.restricted ? "var(--amber)" : "var(--originator-court)"} h={4} />}
            {me.tvQuota && <ProgressBar pct={me.tvQuota.limit ? Math.min(100, (me.tvQuota.used / me.tvQuota.limit) * 100) : 0} color={me.tvQuota.restricted ? "var(--amber)" : "var(--originator-court)"} h={4} />}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            {me.movieQuota && <span>{me.movieQuota.used}/{me.movieQuota.limit ?? "∞"}</span>}
            {me.tvQuota && <span>{me.tvQuota.used}/{me.tvQuota.limit ?? "∞"}</span>}
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((r, i) => {
          const u = users.find((x) => x.id === r.portalUser);
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: rowPadding, borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
              <PosterTile title={r.title} kind={r.kind} cat="request" w={32} art={r.art} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.title} <span style={{ fontWeight: 400, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{r.year}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>
                  {adminMode ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Avatar name={u?.name} src={u?.avatar ?? r.requesterAvatar} size={13} color="var(--originator-court)" />
                      {u?.name} · {r.requested}
                    </span>
                  ) : (
                    r.eta || `Requested ${r.requested}`
                  )}
                </div>
              </div>
              {adminMode && onAct ? (
                <div style={{ display: "flex", gap: 5 }}>
                  <button className="btn btn-tonal" style={{ color: "var(--originator-own)", background: "color-mix(in srgb, var(--originator-own) 12%, transparent)" }} onClick={() => onAct(r.id, "approve")}>
                    Approve
                  </button>
                  <button className="btn btn-tonal" style={{ color: "var(--error)", background: "color-mix(in srgb, var(--error) 10%, transparent)" }} onClick={() => onAct(r.id, "decline")}>
                    Decline
                  </button>
                </div>
              ) : (
                <Pill tone={REQ_TONE[r.status]}>{REQ_LABEL[r.status]}</Pill>
              )}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ── LIBRARY STAT STRIP ─────────────────────────────────────
export function LibraryStats({ fill, visibleIds }: { fill?: boolean; visibleIds?: string } = {}) {
  const { library } = useData();
  const visible = visibleIds
    ? (() => { const s = new Set(visibleIds.split(",").filter(Boolean)); return library.filter(l => s.has(l.id)); })()
    : library;
  if (visible.length === 0)
    return fill ? (
      <PanelShell fill title="Library Stats" icon="video_library" accent="var(--primary)">
        <Empty icon="video_library" line="No library stats" sub="Connect Tautulli or Jellyfin to show movie, show and music counts." />
      </PanelShell>
    ) : null;
  return (
    <div className="aerie-lib-grid" style={fill ? { height: "100%", gridAutoRows: "1fr" } : undefined}>
      {visible.map((l) => (
        <div key={l.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "14px 16px", borderRadius: 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Eyebrow>{l.label}</Eyebrow>
            <Icon name={l.icon} size={15} color="var(--primary)" />
          </div>
          <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", color: "var(--on-surface)", lineHeight: 1 }}>{l.count}</div>
          <div style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>{l.delta}</div>
        </div>
      ))}
    </div>
  );
}

// Measures an element and reports how many fixed-height rows fit inside it.
// Drives the adaptive page size of list panels (Queue, Recently Downloaded).
function useFitRows(rowH: number, fallback = 6) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rows = h > 0 ? Math.max(1, Math.floor(h / rowH)) : fallback;
  return [ref, rows] as const;
}

// THE dashboard rule for item collections in a grid tile (fill): measure the box
// and lay items out ROW-MAJOR (reading left-to-right) — row 1 fills the whole
// width first, then wraps to a second/third row ONLY when the tile is tall
// enough for another row. When it isn't, cap the rows at what fits and scroll
// HORIZONTALLY, with the scrollbar pinned to the box bottom.
// `stretch` makes items share the row width evenly (service tiles) instead of
// keeping a fixed width (posters).
function FlowGrid<T>({
  items,
  itemW,
  itemH,
  gap = 12,
  padX = 16,
  padY = 12,
  stretch = false,
  render,
}: {
  items: T[];
  itemW: number;
  itemH: number;
  gap?: number;
  padX?: number;
  padY?: number;
  stretch?: boolean;
  render: (item: T, index: number) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const T_ = items.length;
  const innerW = box.w > 0 ? box.w - padX * 2 : 0;
  const innerH = box.h > 0 ? box.h - padY * 2 : 0;
  const colsFit = Math.max(1, Math.floor((innerW + gap) / (itemW + gap)));
  const rowsFit = Math.max(1, Math.floor((innerH + gap) / (itemH + gap)));
  let rows: number; // how many rows to render
  let perRow: number; // items per row
  let scrolls: boolean; // horizontal overflow mode
  if (innerW <= 0 || innerH <= 0) {
    rows = 1;
    perRow = T_;
    scrolls = true;
  } else if (Math.ceil(T_ / colsFit) <= rowsFit) {
    // Everything fits: fill each row to the full width, wrap downward.
    perRow = colsFit;
    rows = Math.max(1, Math.ceil(T_ / perRow));
    scrolls = false;
  } else {
    // Not enough vertical room for all the rows: cap at what fits, scroll sideways.
    rows = rowsFit;
    perRow = Math.ceil(T_ / rows);
    scrolls = true;
  }
  const chunks: T[][] = [];
  for (let r = 0; r < rows; r++) {
    const slice = items.slice(r * perRow, (r + 1) * perRow);
    if (slice.length) chunks.push(slice);
  }

  return (
    <div
      ref={ref}
      className="custom-scrollbar"
      style={{ height: "100%", boxSizing: "border-box", padding: `${padY}px ${padX}px`, overflowX: "auto", overflowY: "hidden", display: "flex", flexDirection: "column", gap }}
    >
      {chunks.map((row, r) =>
        stretch && !scrolls ? (
          // Stretchy items (service tiles): share the row width evenly.
          <div key={r} style={{ display: "grid", gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`, gap, flex: 1, minHeight: itemH, alignItems: "start" }}>
            {row.map((item, j) => render(item, r * perRow + j))}
          </div>
        ) : (
          <div key={r} style={{ display: "flex", gap, flex: 1, minHeight: itemH, alignItems: "flex-start" }}>
            {stretch
              ? row.map((item, j) => (
                  <div key={r * perRow + j} style={{ flex: `0 0 ${itemW}px`, minWidth: 0 }}>
                    {render(item, r * perRow + j)}
                  </div>
                ))
              : row.map((item, j) => render(item, r * perRow + j))}
          </div>
        ),
      )}
    </div>
  );
}

// Legacy single-row horizontal poster strip (non-grid contexts).
function PosterStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="custom-scrollbar" style={{ display: "flex", gap: 12, padding: 16, overflowX: "auto" }}>
      {children}
    </div>
  );
}

// ── RECENTLY ADDED ─────────────────────────────────────────
export function RecentlyAdded({ fill, limit, mediaKind, title }: { fill?: boolean; limit?: number; mediaKind?: string; title?: string } = {}) {
  const { recent } = useData();
  const filtered = mediaKind && mediaKind.length > 0 ? recent.filter((r) => r.kind === mediaKind) : recent;
  const displayItems = limit != null ? filtered.slice(0, limit) : filtered;
  return (
    <PanelShell fill={fill} title={title && title.length > 0 ? title : "Recently Added"} icon="new_releases" accent="var(--primary)">
      {displayItems.length === 0 ? (
        <Empty icon="new_releases" line="Nothing added yet" sub="Recently added media will appear here." />
      ) : (
        (() => {
          const renderItem = (r: (typeof displayItems)[number]) => (
            <div key={r.id} style={{ width: 76, flexShrink: 0 }}>
              <PosterTile title={r.title} kind={r.kind} cat={r.cat} w={76} art={r.art} />
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--on-surface)", marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{r.year}</div>
            </div>
          );
          return fill ? <FlowGrid items={displayItems} itemW={76} itemH={150} render={renderItem} /> : <PosterStrip>{displayItems.map(renderItem)}</PosterStrip>;
        })()
      )}
    </PanelShell>
  );
}

// ── DOWNLOAD QUEUE (admin) ─────────────────────────────────
export function QueuePanel({ fill, limit, dense, title }: { fill?: boolean; limit?: number; dense?: boolean; title?: string } = {}) {
  const { queue } = useData();
  // In a grid tile, show as many rows as fit the height (no scrolling); the rest
  // is reachable via the ‹ › pager.
  const [fitRef, fitRows] = useFitRows(dense ? 53 : 61);
  const pageSize = limit ?? (fill ? fitRows : 10);
  const { page, totalPages, slice, setPage } = usePagination(queue, pageSize);
  const rowPadding = dense ? "7px 16px" : "11px 16px";
  return (
    <PanelShell
      fill={fill}
      title={title && title.length > 0 ? title : "Download Queue"}
      icon="downloading"
      accent="var(--originator-third-party)"
      count={`${queue.length} active`}
      action={totalPages > 1 ? <PageControls page={page} totalPages={totalPages} setPage={setPage} /> : undefined}
    >
      <div ref={fitRef} style={{ display: "flex", flexDirection: "column", ...(fill ? { height: "100%", overflow: "hidden" } : {}) }}>
        {slice.map((q, i) => (
          <div key={q.id} style={{ padding: rowPadding, borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <Icon name={q.svc === "radarr" ? "movie" : "live_tv"} size={14} color="var(--originator-third-party)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--on-surface)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.title}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{q.speed}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <ProgressBar pct={q.pct} color="var(--originator-third-party)" h={5} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, color: "var(--on-surface)" }}>{q.pct}%</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{q.eta}</span>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ── STORAGE (per-mount disk usage) ─────────────────────────
export function StoragePanel() {
  const { storage } = useData();
  if (storage.length === 0) return null;
  return (
    <PanelShell title="Storage" icon="hard_drive" accent="var(--amber)" count={`${storage.length} ${storage.length === 1 ? "mount" : "mounts"}`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {storage.map((m, i) => {
          const used = m.totalBytes - m.freeBytes;
          const pct = m.totalBytes > 0 ? (used / m.totalBytes) * 100 : 0;
          const color = pct >= 90 ? "var(--error)" : pct >= 75 ? "var(--amber)" : "var(--originator-own)";
          return (
            <div key={m.path} style={{ padding: "11px 16px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <Icon name="folder" size={14} color="var(--on-surface-variant)" />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{fmtBytes(m.freeBytes)} free</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <ProgressBar pct={pct} color={color} h={5} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, color }}>{Math.round(pct)}%</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{fmtBytes(m.totalBytes)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ── COMING SOON (upcoming *arr calendar) ───────────────────
export function UpcomingPanel({ fill, limit, window: windowDays, title }: { fill?: boolean; limit?: number; window?: number; title?: string } = {}) {
  const { upcoming } = useData();
  const now = useTick(60000); // update cutoff every minute
  const cutoff = windowDays != null ? new Date(now + windowDays * 86400000) : null;
  const windowFiltered = cutoff != null
    ? upcoming.filter((u) => new Date(u.when) <= cutoff)
    : upcoming;
  const sliceCap = limit ?? 20;
  const countDisplay = windowFiltered.length > sliceCap
    ? `${sliceCap} of ${windowFiltered.length}`
    : windowFiltered.length > 0 ? `${windowFiltered.length}` : undefined;
  return (
    <PanelShell fill={fill} title={title && title.length > 0 ? title : "Coming Soon"} icon="event_upcoming" accent="var(--originator-court)" count={countDisplay}>
      {windowFiltered.length === 0 ? (
        <Empty icon="event_upcoming" line="Nothing upcoming" sub="Upcoming episodes and releases will appear here." />
      ) : (
        (() => {
          const list = windowFiltered.slice(0, sliceCap);
          const renderItem = (u: (typeof list)[number]) => (
            <div key={u.id} style={{ width: 76, flexShrink: 0 }}>
              <PosterTile title={u.title} kind={u.kind} cat="request" w={76} art={u.art} />
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--on-surface)", marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.title}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={u.ep || ""}>
                {fmtDay(u.when)}{u.ep ? ` · ${u.ep}` : ""}
              </div>
            </div>
          );
          return fill ? <FlowGrid items={list} itemW={76} itemH={150} render={renderItem} /> : <PosterStrip>{list.map(renderItem)}</PosterStrip>;
        })()
      )}
    </PanelShell>
  );
}

// ── LEADERBOARD (Tautulli weekly home stats) ───────────────
export function LeaderboardPanel({ fill, limit, title }: { fill?: boolean; limit?: number; title?: string } = {}) {
  const { topStats } = useData();
  if (!topStats || (topStats.users.length === 0 && topStats.media.length === 0))
    return fill ? (
      <PanelShell fill title={title && title.length > 0 ? title : "Most Active · 7d"} icon="leaderboard" accent="var(--originator-own)">
        <Empty icon="leaderboard" line="No activity yet" sub="Most-active users and titles appear once Tautulli reports plays." />
      </PanelShell>
    ) : null;
  const displayUsers = limit != null ? topStats.users.slice(0, limit) : topStats.users;
  const maxUser = Math.max(1, ...displayUsers.map((u) => u.plays));
  return (
    <PanelShell fill={fill} title={title && title.length > 0 ? title : "Most Active · 7d"} icon="leaderboard" accent="var(--originator-own)">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, paddingBottom: topStats.media.length > 0 ? 0 : 16, height: fill ? "100%" : undefined, boxSizing: "border-box" }}>
        {displayUsers.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <Eyebrow style={{ marginBottom: 8 }}>Top viewers</Eyebrow>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {displayUsers.map((u) => (
                <div key={u.name} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Avatar name={u.name} src={u.avatar} size={20} color="var(--originator-own)" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--on-surface)", flex: "0 0 110px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</span>
                  <div style={{ flex: 1 }}>
                    <ProgressBar pct={(u.plays / maxUser) * 100} color="var(--originator-own)" h={5} />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", minWidth: 48, textAlign: "right" }}>{u.plays} plays</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {topStats.media.length > 0 &&
          (() => {
            const renderItem = (m: (typeof topStats.media)[number], i: number) => (
              <div key={`${m.title}-${i}`} style={{ width: 76, flexShrink: 0 }}>
                <PosterTile title={m.title} kind="movie" cat="stream" w={76} art={m.art} />
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--on-surface)", marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{m.plays} plays</div>
              </div>
            );
            return (
              <div style={fill ? { flex: 1, minHeight: 158, display: "flex", flexDirection: "column" } : undefined}>
                <Eyebrow style={{ marginBottom: 8 }}>Top media</Eyebrow>
                {fill ? (
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <FlowGrid items={topStats.media} itemW={76} itemH={150} gap={10} padX={0} padY={0} render={renderItem} />
                  </div>
                ) : (
                  <div className="custom-scrollbar" style={{ display: "flex", gap: 10, overflowX: "auto", alignItems: "flex-start", paddingLeft: 16, paddingRight: 16, paddingBottom: 16, marginLeft: -16, marginRight: -16 }}>
                    {topStats.media.map(renderItem)}
                  </div>
                )}
              </div>
            );
          })()}
      </div>
    </PanelShell>
  );
}

// ── RECENTLY DOWNLOADED (*arr history) ─────────────────────
export function DownloadsPanel({ fill, limit, dense, title }: { fill?: boolean; limit?: number; dense?: boolean; title?: string } = {}) {
  const { downloads } = useData();
  // In a grid tile, show as many rows as fit the height; the rest pages via ‹ ›.
  const [fitRef, fitRows] = useFitRows(dense ? 28 : 36);
  const pageSize = limit ?? (fill ? fitRows : 10);
  const { page, totalPages, slice, setPage } = usePagination(downloads, pageSize);
  const rowPadding = dense ? "5px 16px" : "9px 16px";
  if (downloads.length === 0)
    return fill ? (
      <PanelShell fill title={title && title.length > 0 ? title : "Recently Downloaded"} icon="download_done" accent="var(--originator-third-party)">
        <Empty icon="download_done" line="No recent downloads" sub="Grabbed and imported items from Sonarr / Radarr appear here." />
      </PanelShell>
    ) : null;
  return (
    <PanelShell
      fill={fill}
      title={title && title.length > 0 ? title : "Recently Downloaded"}
      icon="download_done"
      accent="var(--originator-third-party)"
      count={`${downloads.length}`}
      action={totalPages > 1 ? <PageControls page={page} totalPages={totalPages} setPage={setPage} /> : undefined}
    >
      <div ref={fitRef} style={{ display: "flex", flexDirection: "column", ...(fill ? { height: "100%", overflow: "hidden" } : {}) }}>
        {slice.map((d, i) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: rowPadding, borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
            <Icon name={d.svc === "radarr" ? "movie" : "live_tv"} size={14} color="var(--originator-third-party)" />
            <span style={{ fontSize: 12, color: "var(--on-surface)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</span>
            <Pill tone={d.event === "imported" ? "originator-own" : "on-surface-variant"}>{d.event}</Pill>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", minWidth: 52, textAlign: "right" }}>{timeAgo(d.when)}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ── DISCOVER PANEL (trending / popular / upcoming from Overseerr) ──
export type DiscoverFeed = "trending" | "popularMovies" | "popularTv" | "upcomingMovies" | "watchlist";

export function DiscoverFeedPanel({
  feed,
  fill,
  limit,
  title,
  onRequest,
}: {
  feed: DiscoverFeed;
  fill?: boolean;
  limit?: number;
  title?: string;
  onRequest?: (item: DiscoverItem) => void;
}) {
  const { discover } = useData();
  const META: Record<DiscoverFeed, { icon: string; accent: string; defaultTitle: string; emptyLine: string }> = {
    trending:      { icon: "trending_up",   accent: "var(--originator-court)", defaultTitle: "Trending Now",      emptyLine: "No trending data yet" },
    popularMovies: { icon: "movie",          accent: "var(--originator-court)", defaultTitle: "Popular Movies",    emptyLine: "No popular movies yet" },
    popularTv:     { icon: "live_tv",        accent: "var(--originator-court)", defaultTitle: "Popular TV Shows",  emptyLine: "No popular shows yet" },
    upcomingMovies:{ icon: "event_upcoming", accent: "var(--originator-court)", defaultTitle: "Coming Soon",       emptyLine: "No upcoming releases" },
    watchlist:     { icon: "bookmarks",      accent: "var(--primary)",           defaultTitle: "Plex Watchlist",    emptyLine: "Watchlist is empty" },
  };
  const m = META[feed];
  const items = discover?.[feed] ?? [];
  return (
    <DiscoverPanel
      items={items}
      fill={fill}
      limit={limit}
      title={title && title.length > 0 ? title : m.defaultTitle}
      icon={m.icon}
      accent={m.accent}
      emptyLine={m.emptyLine}
      onRequest={onRequest}
    />
  );
}


const DISCOVER_STATE_TONE: Partial<Record<RequestStatus, string>> = {
  available: "originator-own",
  approved: "originator-court",
  pending: "amber",
  processing: "primary",
};
const DISCOVER_STATE_LABEL: Partial<Record<RequestStatus, string>> = {
  available: "In library",
  approved: "Approved",
  pending: "Requested",
  processing: "Processing",
};

export function DiscoverPanel({
  items,
  fill,
  limit,
  title,
  icon,
  accent,
  emptyLine,
  onRequest,
}: {
  items: DiscoverItem[];
  fill?: boolean;
  limit?: number;
  title: string;
  icon: string;
  accent: string;
  emptyLine: string;
  onRequest?: (item: DiscoverItem) => void;
}) {
  const displayItems = limit != null ? items.slice(0, limit) : items;
  return (
    <PanelShell fill={fill} title={title} icon={icon} accent={accent}>
      {displayItems.length === 0 ? (
        <Empty icon={icon} line={emptyLine} sub="Configure Overseerr to see this feed." />
      ) : (
        (() => {
          const renderItem = (d: DiscoverItem) => {
            const requestable = !d.state || (d.state !== "available" && d.state !== "approved");
            const viewable = !!d.state && !requestable;
            const tone = d.state ? DISCOVER_STATE_TONE[d.state] : undefined;
            const label = d.state ? DISCOVER_STATE_LABEL[d.state] : undefined;
            return (
              <div
                key={d.id}
                style={{ width: 76, flexShrink: 0, cursor: onRequest ? "pointer" : "default" }}
                onClick={() => onRequest && onRequest(d)}
                title={d.title}
              >
                <div style={{ position: "relative" }}>
                  <PosterTile title={d.title} kind={d.kind} cat="request" w={76} art={d.art} />
                  {onRequest && !d.state && (
                    <div style={{ position: "absolute", top: 3, right: 3, background: "color-mix(in srgb, var(--surface-container) 75%, transparent)", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="add" size={15} color="var(--originator-court)" />
                    </div>
                  )}
                  {onRequest && viewable && (
                    <div style={{ position: "absolute", top: 3, right: 3, background: "color-mix(in srgb, var(--surface-container) 75%, transparent)", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="info" size={14} color="var(--on-surface-variant)" />
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--on-surface)", marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{d.year || ""}</div>
                {tone && label && (
                  <Pill tone={tone} style={{ fontSize: 8.5, padding: "1px 5px", marginTop: 3, width: "100%", textAlign: "center", display: "block" }}>{label}</Pill>
                )}
              </div>
            );
          };
          return fill
            ? <FlowGrid items={displayItems} itemW={76} itemH={168} render={renderItem} />
            : <PosterStrip>{displayItems.map(renderItem)}</PosterStrip>;
        })()
      )}
    </PanelShell>
  );
}
