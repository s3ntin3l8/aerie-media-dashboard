"use client";
// ============================================================
// AERIE — Service launcher + embed/launch service view
// ============================================================
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Service } from "@/lib/types";
import { CAT, catColor } from "@/lib/categories";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import { Icon, StatusDot, Divider, SearchField } from "@/components/primitives";
import { Empty } from "@/components/panels";
import { ServiceLogo } from "@/components/ServiceLogo";
import { PageHeader } from "@/components/views/shared";

const CAT_ORDER = ["stream", "request", "automation", "monitor", "infra"] as const;

function LauncherCard({ s, onOpen }: { s: Service; onOpen: () => void }) {
  const c = catColor(s.cat);
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
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <ServiceLogo service={s} size={44} radius={12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 15, color: "var(--on-surface)" }}>{s.name}</span>
            <Icon name={s.embeddable ? "open_in_full" : "open_in_new"} size={14} color="var(--on-surface-variant)" style={{ marginLeft: "auto" }} />
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
  const { role } = usePortal();
  const { services } = useData();
  let list = services;
  if (role !== "admin") list = list.filter((s) => s.cat !== "infra" && s.id !== "prometheus");
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
// NOTE: embeddable services currently render the design's skeleton
// placeholder (EmbeddedMock). The real <iframe src="https://{host}">
// is wired in the integration phase once Traefik forward-auth +
// frame-ancestors are in place (see plan §Embedding).
export function ServiceViewById({ serviceId }: { serviceId: string }) {
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
  return <ServiceView s={s} />;
}

export function ServiceView({ s }: { s: Service }) {
  const router = useRouter();
  const { paletteOpen, modalOpen } = usePortal();
  const c = catColor(s.cat);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [s.id]);

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
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <StatusDot status={s.status} size={7} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>{s.ms}ms</span>
          </span>
          <a href={`https://${s.host}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            <Icon name="open_in_new" size={15} /> New tab
          </a>
        </div>
      </div>

      {s.embeddable ? (
        <>
          <div style={{ height: 34, flexShrink: 0, display: "flex", alignItems: "center", gap: 9, padding: "0 16px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 60%, transparent)" }}>
            <Icon name="lock" size={13} color="var(--originator-own)" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>https://{s.host}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, padding: "1px 7px", borderRadius: 4, background: "color-mix(in srgb, var(--originator-own) 12%, transparent)", color: "var(--originator-own)", fontWeight: 700 }}>FRAME-ANCESTORS OK</span>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
              <Icon name="shield_person" size={12} color="var(--primary)" />
              forward-auth · session OK
            </span>
          </div>
          <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "var(--surface-container-low)" }}>
            {!loaded && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 1 }}>
                <Icon name="sync" size={28} color={c} style={{ animation: "aerieSpin 1s linear infinite" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>Loading embedded session…</span>
              </div>
            )}
            {/* Real embed. Traefik must serve this host with a frame-ancestors
                CSP allowing the portal origin + forward-auth (see docs/EMBEDDING.md). */}
            <iframe
              src={`https://${s.host}`}
              title={`${s.name} (embedded)`}
              onLoad={() => setLoaded(true)}
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

function LaunchScreen({ s }: { s: Service }) {
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
