"use client";
// ============================================================
// AERIE — Service launcher + embed/launch service view
// ============================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { embedSrc } from "@/lib/embed/deepLink";
import type { Service } from "@/lib/types";
import { CAT, catColor, CAT_ORDER } from "@/lib/categories";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";
import { useEmbedProbe } from "@/components/hooks/useEmbedProbe";
import { Icon, StatusDot, Heartbeat, Divider, SearchField } from "@/components/primitives";
import { Empty } from "@/components/panels";
import { ServiceLogo } from "@/components/ServiceLogo";
import { PageHeader } from "@/components/views/shared";
import { NowPlayingChip } from "@/components/views/NowPlayingChip";
import { embedAuthSummary } from "@/components/views/embedAuth";


function LauncherCard({ s, onOpen }: { s: Service; onOpen: () => void }) {
  const c = catColor(s.cat);
  const { favorites, toggleFavorite } = usePortal();
  const pinned = favorites.includes(s.id);
  return (
    <a
      onClick={onOpen}
      title={s.note}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 13,
        padding: 16,
        borderRadius: 14,
        cursor: "pointer",
        textDecoration: "none",
        background: "var(--surface-container-lowest)",
        border: "1px solid var(--outline-variant)",
        overflow: "hidden",
        transition: "border-color .18s, box-shadow .18s, transform .1s",
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
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(s.id);
        }}
        title={pinned ? "Unpin from rail" : "Pin to rail"}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: 8,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: pinned ? "var(--primary)" : "var(--on-surface-variant)",
          opacity: pinned ? 1 : 0.55,
          transition: "color .15s, opacity .15s, background .15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.background = "color-mix(in srgb, var(--surface-container-high) 70%, transparent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = pinned ? "1" : "0.55";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Icon name={pinned ? "star" : "star_border"} size={17} fill={pinned} />
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <ServiceLogo service={s} size={44} radius={12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, paddingRight: 22 }}>
            <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 15, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.host}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.4 }}>{s.note}</div>
      <Divider />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot status={s.status} size={7} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: s.status === "degraded" ? "var(--amber)" : s.status === "down" ? "var(--error)" : "var(--on-surface-variant)" }}>
          {s.status === "up" ? `${s.uptime.toFixed(2)}% · ${s.ms}ms` : s.status === "unknown" ? "no data" : s.status}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "2px 7px",
            borderRadius: 4,
            fontWeight: 700,
            letterSpacing: "0.04em",
            background: s.embeddable ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "color-mix(in srgb, var(--originator-third-party) 12%, transparent)",
            color: s.embeddable ? "var(--primary)" : "var(--originator-third-party)",
          }}
        >
          {s.embeddable ? "EMBED" : "LAUNCH"}
        </span>
      </div>
    </a>
  );
}

export function Launcher() {
  const router = useRouter();
  const list = useVisibleServices("launcher");
  const grouped = CAT_ORDER.map((cat) => ({ cat, items: list.filter((s) => s.cat === cat) })).filter((g) => g.items.length);

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <PageHeader
        eyebrow="Service directory"
        title="Services"
        icon="apps"
        accent="var(--primary)"
        sub={`${list.length} services · embeddable ones open in-portal, the rest launch in a new tab.`}
      >
        <SearchField placeholder="Filter services…" width={240} />
      </PageHeader>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="aerie-page-pad" style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
          {grouped.length === 0 && (
            <section style={{ background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}>
              <Empty icon="apps" line="No services available" sub="Ask an admin to add services in Admin → Services." />
            </section>
          )}
          {grouped.map((g) => (
            <div key={g.cat}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: catColor(g.cat) }} />
                <h2 style={{ fontFamily: "var(--font-headline)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--on-surface)" }}>{CAT[g.cat].label}</h2>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>{g.items.length}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 13 }}>
                {g.items.map((s) => (
                  <LauncherCard key={s.id} s={s} onOpen={() => router.push(`/s/${s.id}`)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Service view (embed iframe tab OR launch) ──────────────
// Embeddable services render a real <iframe src="{scheme}://{host}">; the
// iframe load is the ground-truth embed check (see ServiceView). Non-embeddable
// services fall through to the launch screen. (Traefik must rewrite
// frame-ancestors + forward-auth for the host — see docs/EMBEDDING.md.)
export function ServiceViewById({ serviceId, deepPath }: { serviceId: string; deepPath?: string }) {
  const { services } = useData();
  const s = services.find((x) => x.id === serviceId);
  if (!s) {
    return (
      <section style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)" }}>
        <div style={{ textAlign: "center", color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          Service not found.
        </div>
      </section>
    );
  }
  // Keep-alive embeds are owned by the persistent EmbedHost (mounted in the shell) so their
  // iframe survives navigation; the page renders nothing for them and lets EmbedHost overlay.
  if (s.embeddable && s.keepAlive) return null;
  return <ServiceView s={s} deepPath={deepPath} />;
}

// EMBED_LOAD_TIMEOUT_MS and EMBED_BADGE constants live in
// components/hooks/useEmbedProbe.ts (source of truth).
// ServiceView consumes the hook; mobile MobileServiceView does the same.

export function ServiceView({ s, deepPath }: { s: Service; deepPath?: string }) {
  const router = useRouter();
  const { paletteOpen, modalOpen, favorites, toggleFavorite, user, oidc } = usePortal();
  const { nowPlaying = [] } = useData();
  // Live sessions belonging to this service (matched on the now-playing source id, e.g. "plex").
  const sessions = nowPlaying.filter((np) => np.src === s.id);
  const npAccent = s.id === "plex" ? "var(--originator-third-party)" : "var(--primary)";
  const pinned = favorites.includes(s.id);
  const c = catColor(s.cat);
  const url = `${s.scheme}://${s.host}`;
  // The iframe src: base origin, or a deep path when one is supplied. Held in
  // state so an explicit deep-link navigates the frame (incl. keep-alive embeds)
  // while a plain re-render with no deepPath leaves a kept frame untouched.
  const [frameSrc, setFrameSrc] = useState(() => embedSrc(s.scheme, s.host, deepPath));
  useEffect(() => {
    if (deepPath) setFrameSrc(embedSrc(s.scheme, s.host, deepPath));
  }, [deepPath, s.scheme, s.host]);
  const monitored = s.status !== "unknown";

  const { embedState, badge, onLoad, onError, reload, reloadKey } = useEmbedProbe(s);
  const loaded = embedState === "ok";
  const embedFailed = embedState === "unverified";
  const who = user.name || user.email || "session";
  // Embed subheader auth/cert summary — reflects the service's real Traefik middleware / Authentik
  // access (see embedAuth.ts). Pure + unit-tested there.
  const { lockColor, lockTitle, authText, authColor, authIcon, authTitle } = embedAuthSummary(s, who, oidc);

  // Self-heal: when a failed embed (likely an expired upstream SSO session that redirected the
  // frame to a login page that refuses framing) regains focus, reload it. The user re-authenticates
  // top-level in another tab; returning here issues a fresh navigation with the now-valid cookie.
  // We only subscribe while failed, so healthy/keep-alive embeds are never reloaded on a tab switch.
  useEffect(() => {
    if (!s.embeddable || embedState !== "unverified") return;
    const onReturn = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [s.embeddable, embedState, reload]);

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", borderBottom: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)" }}>
        <button onClick={() => router.push("/services")} className="btn btn-ghost btn-sm" style={{ paddingLeft: 8, paddingRight: 12 }}>
          <Icon name="arrow_back" size={16} /> Services
        </button>
        <div style={{ width: 1, height: 22, background: "var(--outline-variant)" }} />
        <ServiceLogo service={s} size={30} radius={8} />
        <div>
          <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 14, color: "var(--on-surface)", lineHeight: 1.1 }}>{s.name}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>v{String(s.version).replace(/^v/i, "")}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {/* Live now-playing for this service (Plex/Jellyfin/ABS) — nothing when idle. */}
          {sessions.length > 0 && <NowPlayingChip sessions={sessions} accent={npAccent} />}
          {/* Live health — real Gatus data. Hidden entirely when unmonitored
              (status "unknown" → uptime 0 / dead beats), per real-data-or-empty. */}
          {monitored && <Heartbeat beats={s.beats} h={14} barW={2.5} gap={1.5} />}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <StatusDot status={s.status} size={7} />
            {monitored && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
                {s.uptime}% · {s.ms}ms
              </span>
            )}
          </span>
          <button onClick={() => toggleFavorite(s.id)} className="btn btn-secondary btn-sm" title={pinned ? "Unpin from rail" : "Pin to rail"} style={pinned ? { color: "var(--primary)" } : undefined}>
            <Icon name={pinned ? "star" : "star_border"} size={15} fill={pinned} /> {pinned ? "Pinned" : "Pin"}
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            <Icon name="open_in_new" size={15} /> New tab
          </a>
        </div>
      </div>

      {s.embeddable ? (
        <>
          <div style={{ height: 34, flexShrink: 0, display: "flex", alignItems: "center", gap: 9, padding: "0 16px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 60%, transparent)" }}>
            <span title={lockTitle} style={{ display: "inline-flex", alignItems: "center", cursor: s.route?.cert ? "help" : undefined }}>
              <Icon name={s.scheme === "https" ? "lock" : "lock_open"} size={13} color={lockColor} />
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>{url}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, padding: "1px 7px", borderRadius: 4, background: `color-mix(in srgb, ${badge.color} 12%, transparent)`, color: badge.color, fontWeight: 700 }}>{badge.label}</span>
            <span title={authTitle} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
              <Icon name={authIcon} size={12} color={authColor} />
              {authText}
            </span>
          </div>
          <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "var(--surface-container-low)" }}>
            {!loaded && !embedFailed && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 1 }}>
                <Icon name="sync" size={28} color={c} style={{ animation: "aerieSpin 1s linear infinite" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>Loading embedded session…</span>
              </div>
            )}
            {/* The iframe never loaded in time. Most often the upstream SSO session expired and
                the frame got redirected to a login page that refuses framing (e.g. Google OAuth).
                Re-authenticate top-level in a new tab; returning here auto-reloads the embed. */}
            {!loaded && embedFailed && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 1, padding: 32, textAlign: "center" }}>
                <Icon name="lock_reset" size={30} color={badge.color} />
                <div style={{ fontFamily: "var(--font-headline)", fontWeight: 700, fontSize: 15, color: "var(--on-surface)" }}>Session may have expired</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)", maxWidth: 380 }}>
                  The embedded view couldn’t load — your single sign-on session for this service has likely expired (or it may just be slow, or not allow framing). Re-authenticate in a new tab, then come back; the embed reloads itself. Or retry now.
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ color: "var(--primary)" }}>
                    <Icon name="open_in_new" size={15} /> Re-authenticate
                  </a>
                  <button type="button" onClick={reload} className="btn btn-secondary btn-sm">
                    <Icon name="refresh" size={15} /> Retry
                  </button>
                </div>
              </div>
            )}
            {/* Real embed. Traefik must serve this host with a frame-ancestors
                CSP allowing the portal origin + forward-auth (see docs/EMBEDDING.md). */}
            <iframe
              key={reloadKey}
              src={frameSrc}
              title={`${s.name} (embedded)`}
              onLoad={onLoad}
              // onError rarely fires for cross-origin frame blocks, but when it
              // does, resolve immediately instead of waiting out the timeout.
              onError={onError}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", opacity: loaded ? 1 : 0, transition: "opacity .2s" }}
            />
            {/* Iframes paint in their own compositing layer and ignore z-index from the
                parent document. This transparent div sits in the parent stacking context
                so it covers the iframe when any portal overlay is open, letting the
                palette/modal backdrop-filter blur work correctly. */}
            {(paletteOpen || modalOpen) && (
              <div style={{ position: "absolute", inset: 0, zIndex: 2 }} />
            )}
          </div>
        </>
      ) : (
        <LaunchScreen s={s} />
      )}
    </section>
  );
}

export function LaunchScreen({ s }: { s: Service }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: "var(--surface)" }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ marginBottom: 20 }}>
          <ServiceLogo service={s} size={72} radius={20} />
        </div>
        <h2 style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 22, color: "var(--on-surface)" }}>{s.name} opens in a new tab</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--on-surface-variant)", marginTop: 10, maxWidth: 360 }}>
          {s.id === "plex"
            ? "Plex is hosted on plex.tv and can’t be framed, so it launches externally — you stay signed in via your Plex account."
            : "This service is externally hosted and can’t be embedded, so it launches in a new tab."}
        </p>
        <a href={`https://${s.host}`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ marginTop: 22, padding: "12px 22px" }}>
          <Icon name="open_in_new" size={18} /> Launch {s.name}
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
          <Icon name="link" size={13} /> {s.host}
        </div>
      </div>
    </div>
  );
}
