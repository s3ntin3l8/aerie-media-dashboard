"use client";
// ============================================================
// AERIE — shared "Now Playing" enrichment pieces
// Small presentational fragments used by both the desktop rich
// StreamCard (panels.tsx → views/Streams.tsx) and MobileStreams,
// so every enriched field renders identically on both. Each piece
// returns null when it has no data, so missing fields just vanish.
// ============================================================
import React from "react";
import { Icon, Avatar, TRUNCATE } from "@/components/primitives";
import type { NowPlaying } from "@/lib/types";

type Tone = "neutral" | "good" | "warn" | "bad";
const TONE: Record<Tone, string> = {
  neutral: "var(--on-surface-variant)",
  good: "var(--originator-own)",
  warn: "var(--amber)",
  bad: "var(--error)",
};

/** A compact mono chip tinted by tone. */
export function DChip({ tone = "neutral", strong, children }: { tone?: Tone; strong?: boolean; children: React.ReactNode }) {
  const c = TONE[tone];
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        lineHeight: 1.5,
        padding: "1px 6px",
        borderRadius: 4,
        fontWeight: strong ? 700 : 600,
        whiteSpace: "nowrap",
        background: `color-mix(in srgb, ${c} 14%, transparent)`,
        color: c,
      }}
    >
      {children}
    </span>
  );
}

// ── pure formatters ──────────────────────────────────────────
/** kbps → "12.3" (Mbps, 1dp), or null when absent. */
export function mbps(kbps?: number): string | null {
  return kbps != null && kbps > 0 ? (kbps / 1000).toFixed(1) : null;
}
/** ISO 3166-1 alpha-2 → flag emoji ("GB" → 🇬🇧). */
export function flagEmoji(code?: string): string {
  if (!code || code.length !== 2 || !/^[a-z]{2}$/i.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
/** channel count → "5.1" style label. */
function chLabel(ch?: number): string | undefined {
  if (!ch) return undefined;
  if (ch === 1) return "1.0";
  if (ch === 2) return "2.0";
  if (ch === 6) return "5.1";
  if (ch === 8) return "7.1";
  return `${ch}ch`;
}
const isXcode = (d?: string) => d === "transcode" || d === "burn";

// ── meta: season·episode/chapter · air date · rating · genres ────────
export function StreamMeta({ s }: { s: NowPlaying }) {
  const se = s.season != null && s.episode != null ? `S${s.season} · E${s.episode}` : s.episode != null ? `E${s.episode}` : null;
  const year = s.airDate ? s.airDate.slice(0, 4) : s.year != null ? String(s.year) : null;
  const genres = s.genres?.slice(0, 3) ?? [];
  if (!se && !year && !s.contentRating && !genres.length && !s.chapter) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {se && <DChip tone="neutral" strong>{se}</DChip>}
      {s.chapter && <DChip tone="neutral" strong>{`CH ${s.chapter.index}/${s.chapter.count}`}</DChip>}
      {s.chapter?.title && (
        <span style={{ fontSize: 11.5, color: "var(--on-surface-variant)", ...TRUNCATE, maxWidth: 220 }}>
          {s.chapter.title}
        </span>
      )}
      {year && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--on-surface-variant)" }}>{year}</span>}
      {s.contentRating && (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            padding: "1px 6px",
            borderRadius: 4,
            border: "1px solid color-mix(in srgb, var(--outline-variant) 80%, transparent)",
            color: "var(--on-surface-variant)",
          }}
        >
          {s.contentRating}
        </span>
      )}
      {genres.map((g) => (
        <span key={g} style={{ fontSize: 11.5, color: "var(--on-surface-variant)" }}>
          {g}
        </span>
      ))}
    </div>
  );
}

// ── user badge: real Plex avatar (falls back to generated initials) ──
export function StreamAvatar({ s, size = 17, color }: { s: NowPlaying; size?: number; color?: string }) {
  return <Avatar name={s.user} src={s.userAvatar} size={size} color={color} />;
}

// ── tech spec grid: Video / Audio / Subtitles / Container / Engine ──
// A scannable label→value table. Each value is tinted by tone (green = passed
// through, amber = transcoded/remuxed, red = throttled), and "→" reads source→
// delivered. Replaces the older free-floating chip rows for legibility.
export function StreamTech({ s }: { s: NowPlaying }) {
  const rows: { label: string; value: string; tone: Tone }[] = [];

  // Video
  if (s.videoDecision || (s.codec && s.codec !== "—")) {
    const x = isXcode(s.videoDecision);
    rows.push({ label: "Video", tone: x ? "warn" : "good", value: x && s.streamCodec ? `${s.codec} → ${s.streamCodec}` : s.codec });
  }
  // Audio
  if (s.audioDecision || s.audioCodec) {
    const x = isXcode(s.audioDecision);
    const src = [s.audioCodec, s.audioLayout].filter(Boolean).join(" ");
    const dst = [s.streamAudioCodec, chLabel(s.streamAudioChannels)].filter(Boolean).join(" ");
    rows.push({ label: "Audio", tone: x ? "warn" : "good", value: x && dst ? `${src} → ${dst}` : src || s.audioCodec || "" });
  }
  // Subtitles
  if (s.subtitle?.codec) {
    const burn = s.subtitle.transcode;
    rows.push({ label: "Subtitles", tone: burn ? "warn" : "neutral", value: `${s.subtitle.codec}${burn ? " · burned in" : ""}` });
  }
  // Container
  if (s.sourceContainer && s.streamContainer && s.sourceContainer !== s.streamContainer) {
    rows.push({ label: "Container", tone: "warn", value: `${s.sourceContainer} → ${s.streamContainer}` });
  } else if (s.sourceContainer) {
    rows.push({ label: "Container", tone: "neutral", value: s.sourceContainer });
  }
  // Engine (transcode only): HW/SW · speed · throttle · buffer
  if (s.play === "transcode") {
    const slow = s.transcodeThrottled || (s.transcodeSpeed != null && s.transcodeSpeed > 0 && s.transcodeSpeed < 1);
    const parts = [
      s.hwTranscode ? "HW" : "SW",
      s.transcodeSpeed != null ? `${s.transcodeSpeed.toFixed(1)}×` : null,
      s.transcodeThrottled ? "throttled" : null,
      s.transcodeProgress != null && s.transcodeProgress > 0 && s.transcodeProgress < 100 ? `buffer ${Math.round(s.transcodeProgress)}%` : null,
    ].filter(Boolean);
    if (parts.length) rows.push({ label: "Engine", tone: slow ? "bad" : "good", value: parts.join(" · ") });
  }

  if (!rows.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 14, rowGap: 4, alignItems: "baseline" }}>
      {rows.map((r) => (
        <React.Fragment key={r.label}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--on-surface-variant)" }}>{r.label}</span>
          {/* neutral values brighten to on-surface for legibility on the blurred backdrop;
              toned (good/warn/bad) values keep their signal color */}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: r.tone === "neutral" ? "var(--on-surface)" : TONE[r.tone] }}>{r.value}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── quality: resolution · HDR · fps + bitrate ────────────────
// (codec is owned by the StreamTech spec grid below, so it's omitted here)
export function StreamQuality({ s }: { s: NowPlaying }) {
  const specs = [s.res !== "—" ? s.res : null, s.dynamicRange, s.framerate].filter(Boolean);
  const src = mbps(s.sourceKbps);
  // A "0" bitrate means the source doesn't report one (e.g. Audiobookshelf) — treat as absent.
  const rate = s.bitrate && s.bitrate !== "0" ? `${src && src !== s.bitrate ? `${src} → ` : ""}${s.bitrate} Mbps` : null;
  if (!specs.length && !rate) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
      {specs.length > 0 && <span style={{ color: "var(--on-surface)" }}>{specs.join(" · ")}</span>}
      {rate && <span style={{ color: "var(--on-surface)" }}>{rate}</span>}
    </span>
  );
}

// ── client: product · platform · OS · quality profile ────────
export function StreamClient({ s }: { s: NowPlaying }) {
  // Drop platform if it duplicates the product token (e.g. product "Plex" + platform "Plex").
  const dupPlatform = s.platform && s.product && s.product.toLowerCase().includes(s.platform.toLowerCase());
  const parts = [
    [s.product, s.productVersion].filter(Boolean).join(" "),
    dupPlatform ? "" : [s.platform, s.platformVersion].filter(Boolean).join(" "),
    s.devicePlatform,
  ].filter((p) => p && p.length);
  if (!parts.length && !s.qualityProfile) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--on-surface-variant)", minWidth: 0 }}>
      <Icon name="devices" size={12} color="var(--on-surface-variant)" />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--on-surface)", fontWeight: 500 }}>
        {parts.join(" · ")}
        {s.qualityProfile ? `${parts.length ? " · " : ""}${s.qualityProfile}` : ""}
      </span>
    </span>
  );
}

// ── network: location · geo · IP · secure · bandwidth ────────
export function StreamNetwork({ s }: { s: NowPlaying }) {
  const loc = s.relayed ? "RELAY" : s.location ? s.location.toUpperCase() : null;
  const geo = s.geo ? [s.geo.city, s.geo.code].filter(Boolean).join(", ") : null;
  const bw = mbps(s.sessionKbps);
  if (!loc && !geo && !s.ipPublic && bw == null && s.secure == null) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {loc && <DChip tone={s.relayed ? "warn" : "neutral"} strong>{loc}</DChip>}
      {geo && (
        <span style={{ fontSize: 11.5, color: "var(--on-surface)" }}>
          {flagEmoji(s.geo?.code)} {geo}
        </span>
      )}
      {s.ipPublic && !s.local && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{s.ipPublic}</span>
      )}
      {/* Only flag the positive (encrypted) case. A reverse proxy / CF tunnel
          makes Plex report secure=0 for normal WAN traffic, so a red "insecure"
          chip would fire near-permanently and read as a false alarm. */}
      {s.secure === true && <Icon name="lock" size={12} color="var(--originator-own)" />}
      {bw != null && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>
          <Icon name="speed" size={11} color="var(--on-surface-variant)" />
          {bw} Mbps
        </span>
      )}
    </div>
  );
}
