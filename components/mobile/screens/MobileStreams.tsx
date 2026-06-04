"use client";
import React from "react";
import {
  Icon,
  Equalizer,
  ProgressBar,
  PosterTile,
  Avatar,
} from "@/components/primitives";
import { useData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { useStreamProgress } from "@/components/hooks/useStreamProgress";
import { StreamPipeline, StreamQuality, TranscodeHealth, StreamClient, StreamNetwork } from "@/components/streams/StreamDetail";
import type { NowPlaying } from "@/lib/types";

function StreamCard({ s }: { s: NowPlaying }) {
  const { cur, pct } = useStreamProgress(s);
  const accent =
    s.src === "plex" ? "var(--originator-third-party)" : "var(--primary)";

  const fmtTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s2 = Math.floor(sec % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s2).padStart(2, "0")}`
      : `${m}:${String(s2).padStart(2, "0")}`;
  };

  return (
    <div
      className="card"
      style={{
        padding: 15,
        borderRadius: 18,
        background: "var(--surface-container)",
        display: "flex",
        flexDirection: "column",
        gap: 11,
      }}
    >
      {/* Header row: poster + metadata */}
      <div style={{ display: "flex", gap: 13 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <PosterTile
            title={s.title}
            kind={s.kind}
            cat="stream"
            w={64}
            ratio={s.kind === "track" ? 1 : 1.4}
            rounded={10}
            art={s.art}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {s.kind === "track" ? (
              <Equalizer color="#fff" active={!s.paused} bars={4} h={16} />
            ) : (
              <Icon
                name={s.paused ? "pause" : "play_arrow"}
                size={22}
                fill
                color="#fff"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}
              />
            )}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 15,
                fontWeight: 700,
                color: "var(--on-surface)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {s.title}
            </span>
            {s.year != null && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--on-surface-variant)",
                  flexShrink: 0,
                }}
              >
                {s.year}
              </span>
            )}
            {s.paused && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background:
                    "color-mix(in srgb, var(--amber) 14%, transparent)",
                  color: "var(--amber)",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                PAUSED
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--on-surface-variant)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {(s.ep ? s.ep + " · " : "") + s.device}
          </div>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Avatar name={s.user} size={18} />
            <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
              {s.user}
            </span>
          </span>
        </div>
      </div>

      {/* Progress row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: accent,
            flexShrink: 0,
          }}
        >
          {fmtTime(cur)}
        </span>
        <div style={{ flex: 1 }}>
          <ProgressBar pct={pct} color={accent} h={4} />
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--on-surface-variant)",
            flexShrink: 0,
          }}
        >
          {fmtTime(s.dur * 60)}
        </span>
      </div>

      {/* Tech info — quality + transcode pipeline/health */}
      <div
        style={{
          borderTop: "1px solid var(--outline-variant)",
          paddingTop: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 700,
              background: `color-mix(in srgb, ${s.play === "transcode" ? "var(--amber)" : "var(--originator-own)"} 14%, transparent)`,
              color: s.play === "transcode" ? "var(--amber)" : "var(--originator-own)",
            }}
          >
            {s.play === "transcode" ? "TRANSCODE" : "DIRECT"}
          </span>
          <StreamQuality s={s} />
        </span>
        {(s.videoDecision || s.audioDecision || s.subtitle?.codec) && <StreamPipeline s={s} />}
        <TranscodeHealth s={s} />
      </div>

      {/* Client + network */}
      {(s.product || s.platform || s.qualityProfile || s.location || s.geo || s.ipPublic) && (
        <div
          style={{
            borderTop: "1px solid var(--outline-variant)",
            paddingTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <StreamClient s={s} />
          <StreamNetwork s={s} />
        </div>
      )}
    </div>
  );
}

export function MobileStreams() {
  const { nowPlaying } = useData();
  const { role, user } = usePortal();
  const streams =
    role === "admin"
      ? nowPlaying
      : nowPlaying.filter((s) => s.user === user.id);

  return (
    <div
      style={{
        padding: 18,
        paddingTop: 4,
        display: "flex",
        flexDirection: "column",
        gap: 13,
      }}
    >
      {streams.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--on-surface-variant)",
            fontSize: 13,
          }}
        >
          <Icon name="play_disabled" size={36} color="var(--on-surface-variant)" />
          <div style={{ marginTop: 12 }}>Nothing is playing right now.</div>
        </div>
      ) : (
        <>
          {streams.map((s) => (
            <StreamCard key={s.id} s={s} />
          ))}
          <div
            style={{
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--on-surface-variant)",
              padding: "4px 0 2px",
            }}
          >
            {streams.filter((s) => !s.paused).length} active ·{" "}
            {streams.filter((s) => s.paused).length} paused
          </div>
        </>
      )}
    </div>
  );
}
