"use client";
import React from "react";
import { useRouter } from "next/navigation";
import {
  Icon,
  StatusDot,
  Heartbeat,
  Equalizer,
  ProgressBar,
  PosterTile,
} from "@/components/primitives";
import { useData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { SectionHead, ApprovalRow } from "@/components/mobile/mcommon";
import { useStreamProgress } from "@/components/hooks/useStreamProgress";
import { useRequestReview } from "@/components/hooks/useRequestReview";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";
import { getGreeting } from "@/lib/greeting";
import type { NowPlaying } from "@/lib/types";

// Inner component so useStreamProgress hook is always called at top level
function NowPlayingRow({ s, divider }: { s: NowPlaying; divider: boolean }) {
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
      style={{
        borderTop: divider ? "1px solid var(--outline-variant)" : "none",
        display: "flex",
        gap: 12,
        padding: "12px 0",
      }}
    >
      <PosterTile
        title={s.title}
        kind={s.kind}
        cat="stream"
        w={50}
        ratio={s.kind === "track" ? 1 : 1.4}
        rounded={8}
        art={s.art}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--on-surface)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {s.title}
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
            <ProgressBar pct={pct} color={accent} h={3} />
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
      </div>
    </div>
  );
}

export function MobileHome() {
  const router = useRouter();
  const { role, user } = usePortal();
  const { nowPlaying, requests, library, bandwidth } = useData();
  const visibleServices = useVisibleServices("status");
  const { onAct } = useRequestReview();
  const { greet } = getGreeting();

  // Status strip
  const degraded = visibleServices.filter(
    (s) => s.status !== "up" && s.status !== "unknown"
  ).length;
  const up = visibleServices.filter((s) => s.status === "up").length;
  const activeStreams = nowPlaying.filter((s) => !s.paused);
  const totalMbps = bandwidth?.totalMbps ?? 0;

  // RBAC filtering for now-playing
  const myStreams =
    role === "admin"
      ? nowPlaying
      : nowPlaying.filter((s) => s.user === user.id);
  const previewStreams = myStreams.slice(0, 2);

  // Requests
  const pendingRequests = requests
    .filter((r) => r.status === "pending")
    .slice(0, 3);
  const myRequests = requests
    .filter((r) => r.portalUser === user.id)
    .slice(0, 3);
  const queueItems = role === "admin" ? pendingRequests : myRequests;

  const colors = [
    "var(--primary)",
    "var(--originator-court)",
    "var(--originator-third-party)",
    "var(--originator-own)",
  ];

  return (
    <div
      style={{
        padding: 18,
        paddingTop: 4,
        display: "flex",
        flexDirection: "column",
        gap: 26,
      }}
    >
      {/* Greeting + status strip */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--on-surface)",
            lineHeight: 1.05,
          }}
          suppressHydrationWarning
        >
          {greet}, {user.name}.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          {degraded > 0 ? (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <StatusDot status="degraded" size={7} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--amber)",
                  fontWeight: 600,
                }}
              >
                {degraded} DEGRADED
              </span>
            </span>
          ) : (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <StatusDot status="up" size={7} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--originator-own)",
                  fontWeight: 600,
                }}
              >
                ALL SYSTEMS UP
              </span>
            </span>
          )}
          <span
            style={{
              width: 1,
              height: 12,
              background: "var(--outline-variant)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--on-surface-variant)",
            }}
          >
            {up}/{visibleServices.length} up
          </span>
          {activeStreams.length > 0 && (
            <>
              <span style={{ flex: 1 }} />
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Equalizer color="var(--primary)" bars={3} h={11} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--on-surface)",
                  }}
                >
                  {activeStreams.length}
                  {totalMbps > 0 ? ` · ${totalMbps.toFixed(1)} Mbps` : ""}
                </span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Library stats 2×2 */}
      {library.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 13,
          }}
        >
          {library.slice(0, 4).map((l, i) => (
            <div
              key={l.id}
              className="card"
              style={{
                padding: 15,
                borderRadius: 18,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                background: "var(--surface-container)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--on-surface-variant)",
                  }}
                >
                  {l.label}
                </span>
                <Icon name={l.icon} size={15} color={colors[i % colors.length]} />
              </div>
              <div
                style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "var(--on-surface)",
                  lineHeight: 1,
                }}
              >
                {l.count}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: "var(--on-surface-variant)",
                }}
              >
                {l.delta}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Now Playing preview */}
      <div>
        <SectionHead
          icon="play_circle"
          title="Now Playing"
          count={myStreams.length + " active"}
          live={myStreams.some((s) => !s.paused)}
          onAction={myStreams.length > 0 ? () => router.push("/streams") : undefined}
        />
        {previewStreams.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--on-surface-variant)",
              padding: "8px 2px",
            }}
          >
            Nothing playing right now.
          </div>
        ) : (
          <div
            className="card"
            style={{
              padding: "2px 15px",
              borderRadius: 18,
              background: "var(--surface-container)",
            }}
          >
            {previewStreams.map((s, i) => (
              <NowPlayingRow key={s.id} s={s} divider={i > 0} />
            ))}
          </div>
        )}
      </div>

      {/* Approval Queue / My Requests */}
      <div>
        <SectionHead
          icon="approval"
          title={role === "admin" ? "Approval Queue" : "My Requests"}
          count={
            queueItems.length +
            (role === "admin" ? " pending" : " requests")
          }
          color="var(--originator-court)"
          onAction={() => router.push("/requests")}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {queueItems.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--on-surface-variant)",
                padding: "8px 2px",
              }}
            >
              {role === "admin"
                ? "No pending requests."
                : "You haven't made any requests yet."}
            </div>
          ) : (
            queueItems.map((r) => (
              <ApprovalRow key={r.id} r={r} onReq={onAct} />
            ))
          )}
        </div>
      </div>

      {/* System Status */}
      <div>
        <SectionHead
          icon="favorite"
          title="System Status"
          count={`${up}/${visibleServices.length} up`}
          color="var(--originator-own)"
          onAction={() => router.push("/status")}
        />
        <div
          className="card"
          style={{
            padding: "4px 15px",
            borderRadius: 18,
            background: "var(--surface-container)",
          }}
        >
          {visibleServices.length === 0 ? (
            <div
              style={{
                padding: "16px 0",
                fontSize: 12,
                color: "var(--on-surface-variant)",
                textAlign: "center",
              }}
            >
              No services monitored.
            </div>
          ) : (
            visibleServices.slice(0, 6).map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 0",
                  borderTop: i
                    ? "1px solid var(--outline-variant)"
                    : "none",
                }}
              >
                <StatusDot status={s.status} size={7} />
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--on-surface)",
                    flex: "0 0 auto",
                    width: 78,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.name}
                </span>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Heartbeat beats={s.beats.slice(-16)} h={16} barW={3} gap={1.5} />
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color:
                      s.status === "up"
                        ? "var(--on-surface-variant)"
                        : "var(--amber)",
                    width: 46,
                    textAlign: "right",
                  }}
                >
                  {s.uptime.toFixed(2)}%
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
