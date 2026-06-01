"use client";
// ============================================================
// AERIE — dashboard panels (committed defaults: spotlight central,
// stripe tiles, heartbeat status). Variant switchers from the
// design-time Tweaks panel were intentionally dropped.
// ============================================================
import React, { useEffect, useState } from "react";
import type { Role, Service, ServiceStatus } from "@/lib/types";
import { useData } from "@/components/portal/DataProvider";
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

export function fmtTime(totalSec: number) {
  totalSec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(totalSec / 3600),
    m = Math.floor((totalSec % 3600) / 60),
    s = totalSec % 60;
  const mm = String(m).padStart(2, "0"),
    ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
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
        ...style,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 16px 11px",
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
      <div style={{ flex: 1, ...bodyStyle }}>{children}</div>
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
export function NowPlayingPanel({ role, big, onAll }: { role: Role; big?: boolean; onAll?: () => void }) {
  const { nowPlaying, services: allServices, users } = useData();
  const now = useTick(1000);
  const [t0] = useState(() => Date.now());
  const elapsed = (now - t0) / 1000;
  let streams = nowPlaying;
  if (role !== "admin") streams = streams.filter((s) => s.user === "you");
  const visible = streams;
  return (
    <PanelShell
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
          {visible.map((s, i) => {
            const svc = allServices.find((x) => x.id === s.src);
            const cur = Math.min(s.dur * 60, s.pos * s.dur * 60 + (s.paused ? 0 : elapsed));
            const pct = (cur / (s.dur * 60)) * 100;
            const c = catColor("stream");
            const u = users.find((x) => x.id === s.user);
            const accent = s.src === "plex" ? "var(--originator-third-party)" : "var(--primary)";
            return (
              <div key={s.id} style={{ position: "relative", display: "flex", gap: 13, padding: big ? "15px 16px" : "12px 16px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)" : "none" }}>
                <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 9999, background: accent }} />
                <PosterTile title={s.title} kind={s.kind} cat="stream" w={big ? 50 : 42} art={s.art} />
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
                        <Avatar name={u ? u.name : s.user} size={16} color={accent} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--on-surface)" }}>{u ? u.name : s.user}</span>
                      </span>
                    )}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "color-mix(in srgb, var(--on-surface-variant) 12%, transparent)", color: "var(--on-surface-variant)" }}>{s.res}</span>
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
                      {s.play === "transcode" ? "TRANSCODE" : "DIRECT"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
                      {s.bitrate} Mbps · {s.codec}
                    </span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "var(--on-surface-variant)" }}>
                      <Icon name={svc?.icon ?? "play_circle"} size={12} color={catColor("stream")} />
                      {svc?.name ?? s.src}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}

// ── SERVICE TILES (stripe) ─────────────────────────────────
export function ServiceTiles({ role, onOpen, onAll, services }: { role: Role; onOpen?: (s: Service) => void; onAll?: () => void; services?: Service[] }) {
  const data = useData();
  let list = services || data.services;
  if (role !== "admin") list = list.filter((s) => s.cat !== "infra" && s.id !== "prometheus");

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 9, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
            <Icon name={s.icon} size={20} color={c} />
          </div>
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
    <PanelShell title="Services" icon="apps" count={`${list.length}`} action={onAll ? <SeeAll onClick={onAll} /> : undefined} bodyStyle={{ padding: 14 }}>
      {list.length === 0 ? (
        <Empty icon="apps" line="No services yet" sub="Add services in Admin to launch them here." />
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
function assertNever(x: never): never {
  throw new Error(`Unhandled ServiceStatus: ${String(x)}`);
}
export function statusColor(st: ServiceStatus) {
  switch (st) {
    case "up":
      return "var(--originator-own)";
    case "degraded":
      return "var(--amber)";
    case "down":
      return "var(--error)";
    case "unknown":
      return "var(--on-surface-variant)";
    default:
      return assertNever(st);
  }
}
export function statusWord(st: ServiceStatus) {
  switch (st) {
    case "up":
      return "OPERATIONAL";
    case "degraded":
      return "DEGRADED";
    case "down":
      return "DOWN";
    case "unknown":
      return "NO DATA";
    default:
      return assertNever(st);
  }
}
/** Short uptime label for a service — honest "—" when health is unknown. */
export function uptimeText(s: Pick<Service, "status" | "uptime">) {
  return s.status === "unknown" ? "—" : `${s.uptime.toFixed(2)}%`;
}

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 11, background: `color-mix(in srgb, ${c} 14%, transparent)`, flexShrink: 0 }}>
          <Icon name={s.icon} size={22} color={c} />
        </div>
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
        <span style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>Last 30 days · v{s.version}</span>
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

export function CentralServices({ onOpen, onAll }: { role?: Role; onOpen?: (s: Service) => void; onAll?: () => void }) {
  const { services } = useData();
  const list = services.filter((s) => s.central);
  if (list.length === 0) return null;
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
    <div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(248px, 1fr))", gap: 14 }}>
        {list.map((s) => (
          <CentralCard key={s.id} s={s} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

// ── STATUS (heartbeat) ─────────────────────────────────────
export function StatusPanel({ role, onAll }: { role: Role; onAll?: () => void }) {
  const { services } = useData();
  const list = services.filter((s) => (role === "admin" ? true : s.cat !== "infra"));
  const up = list.filter((s) => s.status === "up").length;
  const deg = list.filter((s) => s.status === "degraded").length;
  const down = list.filter((s) => s.status === "down").length;
  const unknown = list.filter((s) => s.status === "unknown").length;

  return (
    <PanelShell
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
export const REQ_TONE: Record<string, string> = { available: "originator-own", approved: "originator-court", pending: "amber", declined: "error" };
export const REQ_LABEL: Record<string, string> = { available: "Available", approved: "Approved", pending: "Pending", declined: "Declined" };

export function MyRequestsPanel({ role, onAll }: { role: Role; onAll?: () => void }) {
  const { users, requests } = useData();
  const me = users.find((u) => u.id === "you") ?? users[0];
  const mine = requests.filter((r) => r.user === "you");
  const queue = requests.filter((r) => r.status === "pending");
  const adminMode = role === "admin";
  const items = adminMode ? queue : mine;
  return (
    <PanelShell
      title={adminMode ? "Approval Queue" : "My Requests"}
      icon={adminMode ? "inbox" : "bookmark_added"}
      accent="var(--originator-court)"
      count={adminMode ? `${queue.length} pending` : undefined}
      action={<SeeAll onClick={onAll} />}
    >
      {!adminMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)" }}>
          <Eyebrow>Quota</Eyebrow>
          <div style={{ flex: 1 }}>
            <ProgressBar pct={(me.reqUsed / me.reqQuota) * 100} color="var(--originator-court)" h={6} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
            {me.reqUsed}/{me.reqQuota}
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((r, i) => {
          const u = users.find((x) => x.id === r.user);
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 16px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
              <PosterTile title={r.title} kind={r.kind} cat="request" w={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.title} <span style={{ fontWeight: 400, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{r.year}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>
                  {adminMode ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Avatar name={u?.name} size={13} color="var(--originator-court)" />
                      {u?.name} · {r.requested}
                    </span>
                  ) : (
                    r.eta || `Requested ${r.requested}`
                  )}
                </div>
              </div>
              {adminMode ? (
                <div style={{ display: "flex", gap: 5 }}>
                  <button className="btn btn-tonal" style={{ color: "var(--originator-own)", background: "color-mix(in srgb, var(--originator-own) 12%, transparent)" }}>
                    Approve
                  </button>
                  <button className="btn btn-tonal" style={{ color: "var(--error)", background: "color-mix(in srgb, var(--error) 10%, transparent)" }}>
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
export function LibraryStats() {
  const { library } = useData();
  if (library.length === 0) return null;
  return (
    <div className="aerie-lib-grid">
      {library.map((l) => (
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

// ── RECENTLY ADDED ─────────────────────────────────────────
export function RecentlyAdded() {
  const { recent } = useData();
  return (
    <PanelShell title="Recently Added" icon="new_releases" accent="var(--primary)">
      {recent.length === 0 ? (
        <Empty icon="new_releases" line="Nothing added yet" sub="Recently added media will appear here." />
      ) : (
      <div className="custom-scrollbar" style={{ display: "flex", gap: 12, padding: 16, overflowX: "auto" }}>
        {recent.map((r) => (
          <div key={r.id} style={{ width: 76, flexShrink: 0 }}>
            <PosterTile title={r.title} kind={r.kind} cat={r.cat} w={76} art={r.art} />
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--on-surface)", marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{r.year}</div>
          </div>
        ))}
      </div>
      )}
    </PanelShell>
  );
}

// ── DOWNLOAD QUEUE (admin) ─────────────────────────────────
export function QueuePanel() {
  const { queue } = useData();
  return (
    <PanelShell title="Download Queue" icon="downloading" accent="var(--originator-third-party)" count={`${queue.length} active`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {queue.map((q, i) => (
          <div key={q.id} style={{ padding: "11px 16px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
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
