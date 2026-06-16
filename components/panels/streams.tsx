"use client";
// ============================================================
// AERIE — streams cluster (Now Playing panel + rich session cards).
// Moved verbatim out of components/panels.tsx; shared shell/util
// symbols (PanelShell, Empty, SeeAll, fmtTime, useTick) still live
// in panels.tsx and are imported back here (one-way; no cycle).
// ============================================================
import React, { useState } from "react";
import type { Role, Service, SelectMediaHint } from "@/lib/types";
import { useData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import {
  Icon,
  Equalizer,
  ProgressBar,
  PosterTile,
  Avatar,
  catColor,
  TRUNCATE,
  listDivider,
} from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { useStreamProgress } from "@/components/hooks/useStreamProgress";
import { StreamQuality, StreamClient, StreamNetwork, StreamMeta, StreamTech, StreamAvatar } from "@/components/streams/StreamDetail";
import { PanelShell, Empty, SeeAll, fmtTime } from "@/components/panels";

// ── NOW PLAYING ───────────────────────────────────────────

// Inner row extracted so the hook can be called once per stream item.

function StreamRow({ s, i, big, role, allServices, users, onSelect }: { s: import("@/lib/types").NowPlaying; i: number; big?: boolean; role: Role; allServices: Service[]; users: import("@/lib/types").User[]; onSelect?: (h: SelectMediaHint) => void }) {
  const { cur, pct } = useStreamProgress(s);
  const svc = allServices.find((x) => x.id === s.src);
  const c = catColor("stream");
  const u = users.find((x) => x.id === s.user);
  const accent = s.src === "plex" ? "var(--originator-third-party)" : "var(--primary)";
  // "0" bitrate / "—" codec mean the source doesn't report them (e.g. Audiobookshelf):
  // show only what's real, falling back to the audio codec for audio-only sessions.
  const rateCodec = [s.bitrate !== "0" ? `${s.bitrate} Mbps` : null, s.codec !== "—" ? s.codec : s.audioCodec].filter(Boolean).join(" · ");
  const canOpen = !!onSelect && (s.kind === "movie" || s.kind === "series");
  return (
    <div
      onClick={canOpen ? () => onSelect!({ kind: s.kind, tmdbId: s.tmdbId, grandparentRatingKey: s.grandparentRatingKey }) : undefined}
      style={{ position: "relative", display: "flex", gap: 13, padding: big ? "15px 16px" : "12px 16px", borderTop: listDivider(i, 50), cursor: canOpen ? "pointer" : "default" }}
    >
      <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 9999, background: accent }} />
      {/* audio covers (ABS books, albums) are square; video posters 2:3 */}
      <PosterTile title={s.title} kind={s.kind} cat="stream" w={big ? 50 : 42} ratio={s.kind === "track" ? 1 : 1.5} art={s.art} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
          <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: big ? 15 : 13.5, color: "var(--on-surface)", ...TRUNCATE }}>
            {s.title}
          </span>
          {s.paused ? <Icon name="pause_circle" size={14} color="var(--on-surface-variant)" /> : s.kind === "track" ? <Equalizer color={c} h={11} /> : null}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--on-surface-variant)", marginBottom: 8, ...TRUNCATE }}>
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

export function NowPlayingPanel({ role, big, onAll, fill, source, onSelect }: { role: Role; big?: boolean; onAll?: () => void; fill?: boolean; source?: string; onSelect?: (h: SelectMediaHint) => void }) {
  const { nowPlaying, services: allServices, users } = useData();
  const { user } = usePortal();
  // Per-widget source pick: filter by the media server tag (src) when set; Auto = all.
  const sourced = source ? nowPlaying.filter((s) => s.src === source) : nowPlaying;
  // NOTE: NowPlaying uses Plex/Jellyfin identity, not portal ids — this filter is a
  // placeholder until that identity is linked (see plan "Out of scope"). Currently
  // matches nothing for non-admins, same as before.
  const visible = role !== "admin" ? sourced.filter((s) => s.user === user.id) : sourced;
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
        <Empty art icon="play_disabled" line="Nothing playing" sub="Your active stream will appear here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {visible.map((s, i) => (
            <StreamRow key={s.id} s={s} i={i} big={big} role={role} allServices={allServices} users={users} onSelect={onSelect} />
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
        <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 18, color: "var(--on-surface)", ...TRUNCATE }}>
          {s.title}
        </span>
        {s.paused ? <Icon name="pause_circle" size={16} color="var(--on-surface-variant)" /> : s.kind === "track" ? <Equalizer color={c} h={12} /> : null}
      </div>
      {s.ep && (
        <div style={{ fontSize: 13, color: "var(--on-surface)", ...TRUNCATE }}>{s.ep}</div>
      )}
      {s.narrator && (
        <div style={{ fontSize: 11.5, color: "var(--on-surface-variant)", ...TRUNCATE }}>Read by {s.narrator}</div>
      )}
      <StreamMeta s={s} />
      <div style={{ fontSize: 12, color: "var(--on-surface)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5, ...TRUNCATE }}>
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
      <Empty art icon="play_disabled" line="Nothing playing" sub="Active streams will appear here with full transcode, quality, client and network detail." />
    );
  }
  return (
    <div>
      {role === "admin" && <StreamsSummary streams={visible} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 600px))", justifyContent: "center", gap: 14 }}>
        {visible.map((s) => (
          <StreamCard key={s.id} s={s} role={role} allServices={allServices} users={users} />
        ))}
      </div>
    </div>
  );
}
