"use client";
// ============================================================
// AERIE — Requests view (per-user Overseerr)
// ============================================================
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaRequest } from "@/lib/types";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import { Icon, Pill, Avatar, PosterTile, SearchField } from "@/components/primitives";
import { PageHeader, StatTile } from "@/components/views/shared";
import { Empty, REQ_TONE, REQ_LABEL } from "@/components/panels";

type RequestStatusFilter = "all" | "pending" | "approved" | "available";

function RequestCard({ r, adminMode, onAct }: { r: MediaRequest; adminMode: boolean; onAct: (id: string, action: "approve" | "decline") => void }) {
  const { users } = useData();
  const u = users.find((x) => x.id === r.user);
  return (
    <div style={{ display: "flex", gap: 13, padding: 14, borderRadius: 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)" }}>
      <PosterTile title={r.title} kind={r.kind} cat="request" w={58} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 14, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <Icon name={r.kind === "series" ? "live_tv" : "movie"} size={12} color="var(--on-surface-variant)" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
                {r.kind === "series" ? "Series" : "Movie"} · {r.year}
              </span>
            </div>
          </div>
          <Pill tone={REQ_TONE[r.status]}>{REQ_LABEL[r.status]}</Pill>
        </div>
        <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          {adminMode ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Avatar name={u?.name} size={18} color="var(--originator-court)" />
              <span style={{ fontSize: 11.5, color: "var(--on-surface-variant)" }}>{u?.name}</span>
            </span>
          ) : (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{r.id}</span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--on-surface-variant)" }}>
            {r.eta ? <span style={{ color: "var(--originator-court)", fontWeight: 600 }}>{r.eta}</span> : `Requested ${r.requested}`}
          </span>
          {adminMode && r.status === "pending" && (
            <div style={{ display: "flex", gap: 5, marginLeft: 4 }}>
              <button onClick={() => onAct(r.id, "approve")} className="btn btn-tonal" style={{ color: "var(--originator-own)", background: "color-mix(in srgb, var(--originator-own) 12%, transparent)" }}>
                Approve
              </button>
              <button onClick={() => onAct(r.id, "decline")} className="btn btn-tonal" style={{ color: "var(--error)", background: "color-mix(in srgb, var(--error) 10%, transparent)" }}>
                Decline
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Requests() {
  const router = useRouter();
  const { role } = usePortal();
  const { requests, users } = useData();
  const adminMode = role === "admin";
  const me = users.find((u) => u.id === "you") ?? users[0];
  const [filter, setFilter] = useState<RequestStatusFilter>("all");
  const [acted, setActed] = useState<Record<string, string>>({});

  const base = adminMode ? requests : requests.filter((r) => r.user === "you");
  const filtered = base
    .filter((r) => (filter === "all" ? true : r.status === filter))
    .map((r) => (acted[r.id] ? { ...r, status: acted[r.id] as MediaRequest["status"] } : r));

  const counts: Record<RequestStatusFilter, number> = {
    all: base.length,
    pending: base.filter((r) => r.status === "pending" && !acted[r.id]).length,
    approved: base.filter((r) => (acted[r.id] || r.status) === "approved").length,
    available: base.filter((r) => r.status === "available").length,
  };
  const onAct = (id: string, action: "approve" | "decline") => setActed((a) => ({ ...a, [id]: action === "approve" ? "approved" : "declined" }));

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <PageHeader
        eyebrow={adminMode ? "Overseerr · all members" : "Overseerr · your library"}
        title={adminMode ? "Requests & Approvals" : "My Requests"}
        icon="playlist_add"
        accent="var(--originator-court)"
        sub={adminMode ? "Approve incoming requests and track fulfilment across all members." : "Track what you’ve asked for and what’s ready to watch."}
      >
        <SearchField placeholder="Search movies & shows to request…" width={300} />
        <button onClick={() => router.push("/s/overseerr")} className="btn btn-secondary btn-sm">
          <Icon name="open_in_full" size={15} /> Open Overseerr
        </button>
      </PageHeader>

      {!adminMode && !me.linked && (
        <div style={{ margin: "16px 32px 0", padding: "12px 16px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, background: "color-mix(in srgb, var(--amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--amber) 30%, transparent)" }}>
          <Icon name="link_off" size={18} color="var(--amber)" />
          <div style={{ flex: 1, fontSize: 12.5, color: "var(--on-surface)" }}>
            Your Overseerr account isn’t linked yet — requests may not show your full history.{" "}
            <a style={{ color: "var(--amber)", fontWeight: 600, cursor: "pointer" }}>Link account →</a>
          </div>
        </div>
      )}

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="aerie-page-pad" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="aerie-stat-row">
            {adminMode ? (
              <>
                <StatTile label="Pending" value={counts.pending} color="var(--amber)" icon="pending" />
                <StatTile label="Approved" value={counts.approved} color="var(--originator-court)" icon="check_circle" />
                <StatTile label="Available" value={counts.available} color="var(--originator-own)" icon="download_done" />
                <StatTile label="Members" value={users.length - 1} color="var(--on-surface)" icon="group" />
              </>
            ) : (
              <>
                <StatTile label="Quota used" value={`${me.reqUsed}/${me.reqQuota}`} color="var(--originator-court)" icon="data_usage" />
                <StatTile label="Pending" value={counts.pending} color="var(--amber)" icon="pending" />
                <StatTile label="Available" value={counts.available} color="var(--originator-own)" icon="download_done" />
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {(["all", "pending", "approved", "available"] as RequestStatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "6px 13px",
                  borderRadius: 9999,
                  cursor: "pointer",
                  border: "1px solid " + (filter === f ? "color-mix(in srgb, var(--originator-court) 40%, transparent)" : "var(--outline-variant)"),
                  background: filter === f ? "color-mix(in srgb, var(--originator-court) 13%, transparent)" : "transparent",
                  color: filter === f ? "var(--originator-court)" : "var(--on-surface-variant)",
                }}
              >
                {f} <span style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>{counts[f]}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Empty icon="bookmark_border" line="No requests here" sub="Search above to request a movie or show." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
              {filtered.map((r) => (
                <RequestCard key={r.id} r={r} adminMode={adminMode} onAct={onAct} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
