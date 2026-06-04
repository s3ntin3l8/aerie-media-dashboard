"use client";
// ============================================================
// AERIE — shared "Now Playing" enrichment pieces
// Small presentational fragments used by both the desktop rich
// StreamCard (panels.tsx → views/Streams.tsx) and MobileStreams,
// so every enriched field renders identically on both. Each piece
// returns null when it has no data, so missing fields just vanish.
// ============================================================
import React from "react";
import { Icon } from "@/components/primitives";
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
        fontSize: 9.5,
        lineHeight: 1.5,
        padding: "1px 6px",
        borderRadius: 4,
        fontWeight: strong ? 700 : 500,
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

// ── pipeline: Video / Audio / Subs / Container ───────────────
export function StreamPipeline({ s }: { s: NowPlaying }) {
  const chips: React.ReactNode[] = [];

  // Video
  if (s.videoDecision || s.codec) {
    const x = isXcode(s.videoDecision);
    chips.push(
      <DChip key="v" tone={x ? "warn" : "good"}>
        Video {x && s.streamCodec ? `${s.codec}→${s.streamCodec}` : s.codec}
      </DChip>,
    );
  }
  // Audio
  if (s.audioDecision || s.audioCodec) {
    const x = isXcode(s.audioDecision);
    const src = [s.audioCodec, s.audioLayout].filter(Boolean).join(" ");
    const dst = [s.streamAudioCodec, chLabel(s.streamAudioChannels)].filter(Boolean).join(" ");
    chips.push(
      <DChip key="a" tone={x ? "warn" : "good"}>
        Audio {x && dst ? `${src}→${dst}` : src || s.audioCodec}
      </DChip>,
    );
  }
  // Subtitles
  if (s.subtitle?.codec) {
    const burn = s.subtitle.transcode;
    chips.push(
      <DChip key="s" tone={burn ? "warn" : "neutral"}>
        Subs {burn ? "burn " : ""}
        {s.subtitle.codec}
      </DChip>,
    );
  }
  // Container remux
  if (s.sourceContainer && s.streamContainer && s.sourceContainer !== s.streamContainer) {
    chips.push(
      <DChip key="c" tone="warn">
        {s.sourceContainer}→{s.streamContainer}
      </DChip>,
    );
  }

  if (!chips.length) return null;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{chips}</div>;
}

// ── quality: resolution · codec · HDR · fps + bitrate ────────
export function StreamQuality({ s }: { s: NowPlaying }) {
  const specs = [s.res !== "—" ? s.res : null, s.codec !== "—" ? s.codec : null, s.dynamicRange, s.framerate].filter(Boolean);
  const src = mbps(s.sourceKbps);
  const rate = `${src && src !== s.bitrate ? `${src} → ` : ""}${s.bitrate} Mbps`;
  if (!specs.length && !s.bitrate) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
      {specs.length > 0 && <span style={{ color: "var(--on-surface)" }}>{specs.join(" · ")}</span>}
      <span>{rate}</span>
    </span>
  );
}

// ── transcode health: HW/SW · speed · throttle (transcode only) ──
export function TranscodeHealth({ s }: { s: NowPlaying }) {
  if (s.play !== "transcode") return null;
  const slow = s.transcodeThrottled || (s.transcodeSpeed != null && s.transcodeSpeed > 0 && s.transcodeSpeed < 1);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <DChip tone={s.hwTranscode ? "good" : "neutral"} strong>
        {s.hwTranscode ? "HW" : "SW"}
      </DChip>
      {s.transcodeSpeed != null && (
        <DChip tone={slow ? "bad" : "good"}>{s.transcodeSpeed.toFixed(1)}×</DChip>
      )}
      {s.transcodeThrottled && <DChip tone="bad" strong>THROTTLED</DChip>}
      {s.transcodeProgress != null && s.transcodeProgress > 0 && s.transcodeProgress < 100 && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--on-surface-variant)" }}>buffer {Math.round(s.transcodeProgress)}%</span>
      )}
    </div>
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--on-surface-variant)", minWidth: 0 }}>
      <Icon name="devices" size={12} color="var(--on-surface-variant)" />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        <span style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>
          {flagEmoji(s.geo?.code)} {geo}
        </span>
      )}
      {s.ipPublic && !s.local && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--on-surface-variant)" }}>{s.ipPublic}</span>
      )}
      {/* Only flag the positive (encrypted) case. A reverse proxy / CF tunnel
          makes Plex report secure=0 for normal WAN traffic, so a red "insecure"
          chip would fire near-permanently and read as a false alarm. */}
      {s.secure === true && <Icon name="lock" size={12} color="var(--originator-own)" />}
      {bw != null && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--on-surface-variant)" }}>
          <Icon name="speed" size={11} color="var(--on-surface-variant)" />
          {bw} Mbps
        </span>
      )}
    </div>
  );
}
