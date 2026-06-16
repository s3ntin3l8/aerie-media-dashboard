"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Icon, Eyebrow, Avatar } from "@/components/primitives";
import { useData, useRefresh } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { ApprovalRow, MiniStat } from "@/components/mobile/mcommon";
import { useRequestReview } from "@/components/hooks/useRequestReview";
import { RequestModal } from "@/components/modals/RequestModal";
import { Toast } from "@/components/modals/Toast";
import { submitRequest, deleteRequest, editRequest } from "@/app/(portal)/requests/actions";
import type { DiscoverItem, MediaRequest, RequestStatus } from "@/lib/types";

type Filter = "all" | RequestStatus;
type SortOrder = "added" | "modified";
// Caller-side modal modes: "edit" reopens the request flow with the existing item pre-filled
// (maps to the modal's "request" mode), like the desktop Requests view.
type ModalState = { mode: "request" | "review" | "detail" | "edit"; request?: MediaRequest };

export function MobileRequests() {
  const { requests, users, issues, requestCounts } = useData();
  const { role, user } = usePortal();
  const isAdmin = role === "admin";
  const me = users.find((u) => u.id === user.id) ?? users[0];
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortOrder>("added");
  const [requesterFilter, setRequesterFilter] = useState<string | null>(null);
  const { acted, onAct, applyActed } = useRequestReview();
  const refresh = useRefresh();
  const [reqModal, setReqModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (!isAdmin) setRequesterFilter(null); }, [isAdmin]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleSubmit = async (pick: DiscoverItem, quality: string, seasons: Record<number, boolean>) => {
    const picked = Object.keys(seasons).filter((k) => seasons[Number(k)]).map(Number);
    if (reqModal?.mode === "edit" && reqModal.request) {
      const r = await editRequest(reqModal.request.id, picked, quality);
      flash(r.message);
      if (r.ok) refresh();
      return r;
    }
    const r = await submitRequest(pick, picked, quality);
    flash(r.message);
    refresh();
    return r;
  };

  const handleCancel = (r: MediaRequest) => {
    void deleteRequest(r.id).then((res) => {
      flash(res.message);
      if (res.ok) { refresh(); setReqModal(null); }
    });
  };

  const base = isAdmin ? requests : requests.filter((r) => r.portalUser === user.id);

  const requesters = useMemo(() => {
    const map = new Map<string, { name: string; avatar?: string; count: number }>();
    for (const r of base) {
      const key = r.portalUser ?? r.requesterEmail ?? r.id;
      if (!map.has(key)) map.set(key, { name: r.requesterName ?? r.user, avatar: r.requesterAvatar, count: 0 });
      map.get(key)!.count++;
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [base]);

  const sorted = sort === "modified"
    ? [...base].sort((a, b) => (b.modified ?? b.requested).localeCompare(a.modified ?? a.requested))
    : base;

  // Apply optimistic overlay, drop declined, then status + requester filters.
  const statusFiltered = applyActed(sorted).filter(
    (r) =>
      r.status !== "declined" &&
      (filter === "all" || r.status === filter)
  );
  const displayed = requesterFilter
    ? statusFiltered.filter((r) => (r.portalUser ?? r.requesterEmail ?? r.id) === requesterFilter)
    : statusFiltered;

  // Counts: prefer the upstream totals for admins (the snapshot paginates), else compute locally.
  const localCounts = {
    all: base.filter((r) => r.status !== "declined").length,
    pending: base.filter((r) => (acted[r.id] ?? r.status) === "pending").length,
    approved: base.filter((r) => (acted[r.id] ?? r.status) === "approved").length,
    available: base.filter((r) => r.status === "available").length,
    processing: base.filter((r) => r.status === "processing").length,
    failed: base.filter((r) => r.status === "failed").length,
  };
  const counts = isAdmin && requestCounts ? {
    all: requestCounts.total,
    pending: requestCounts.pending,
    approved: requestCounts.approved,
    available: requestCounts.available,
    processing: requestCounts.processing,
    failed: requestCounts.failed,
  } : localCounts;

  const filters: [Filter, string][] = [
    ["all", "All"],
    ["pending", "Pending"],
    ["approved", "Approved"],
    ["available", "Available"],
    ...(isAdmin ? ([["processing", "Processing"], ["failed", "Failed"]] as [Filter, string][]) : []),
  ];

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
      {/* Header */}
      <div>
        <Eyebrow color="var(--originator-court)">
          {isAdmin ? "Overseerr · All members" : "Overseerr · Your library"}
        </Eyebrow>
        <div
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--on-surface)",
            marginTop: 4,
          }}
        >
          Requests
        </div>
      </div>

      {/* Account-link warning (non-admin, unlinked Overseerr account) */}
      {!isAdmin && me && !me.linked && (
        <div style={{ padding: "11px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 10, background: "color-mix(in srgb, var(--amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--amber) 30%, transparent)" }}>
          <Icon name="link_off" size={17} color="var(--amber)" />
          <div style={{ flex: 1, fontSize: 12, color: "var(--on-surface)" }}>
            Your Overseerr account isn’t linked yet — requests may not show your full history.
          </div>
        </div>
      )}

      {/* Stats row — role-aware to match desktop */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 8,
        }}
      >
        {isAdmin ? (
          <>
            <MiniStat label="Pending" value={counts.pending} icon="pending" color="var(--amber)" />
            <MiniStat label="Approved" value={counts.approved} icon="check_circle" color="var(--originator-court)" />
            <MiniStat label="Avail." value={counts.available} icon="task_alt" color="var(--originator-own)" />
            {issues && issues.open > 0 ? (
              <MiniStat label="Issues" value={issues.open} icon="report" color="var(--error)" />
            ) : (
              <MiniStat label="Members" value={Math.max(0, users.length - 1)} icon="group" color="var(--on-surface-variant)" />
            )}
          </>
        ) : (
          <>
            {me?.movieQuota != null ? (
              <MiniStat label="Movies" value={`${me.movieQuota.used}/${me.movieQuota.limit ?? "∞"}`} icon="movie" color={me.movieQuota.restricted ? "var(--amber)" : "var(--originator-court)"} />
            ) : (
              <MiniStat label="Approved" value={counts.approved} icon="check_circle" color="var(--originator-court)" />
            )}
            {me?.tvQuota != null ? (
              <MiniStat label="TV quota" value={`${me.tvQuota.used}/${me.tvQuota.limit ?? "∞"}`} icon="live_tv" color={me.tvQuota.restricted ? "var(--amber)" : "var(--originator-court)"} />
            ) : (
              <MiniStat label="Total" value={counts.all} icon="list" color="var(--on-surface-variant)" />
            )}
            <MiniStat label="Pending" value={counts.pending} icon="pending" color="var(--amber)" />
            <MiniStat label="Avail." value={counts.available} icon="task_alt" color="var(--originator-own)" />
          </>
        )}
      </div>

      {/* Status filter chips + sort toggle (chips scroll horizontally to fit the extra admin ones) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", flex: 1, paddingBottom: 2, scrollbarWidth: "none" }}>
          {filters.map(([id, label]) => {
            const on = filter === id;
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 13px",
                  borderRadius: 9999,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  border:
                    "1px solid " +
                    (on
                      ? "color-mix(in srgb, var(--primary) 45%, transparent)"
                      : "var(--outline-variant)"),
                  background: on
                    ? "color-mix(in srgb, var(--primary) 13%, transparent)"
                    : "var(--surface-container)",
                  color: on ? "var(--primary)" : "var(--on-surface-variant)",
                }}
              >
                {label}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.8 }}>
                  {counts[id as keyof typeof counts] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setSort((s) => (s === "added" ? "modified" : "added"))}
          title={sort === "added" ? "Sort by last modified" : "Sort by date added"}
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 10px", borderRadius: 9999, cursor: "pointer", border: "1px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)", fontSize: 10 }}
        >
          <Icon name="swap_vert" size={13} />
          {sort === "added" ? "Date" : "Modified"}
        </button>
      </div>

      {/* Requester filter (admin) — horizontally scrollable avatar chips */}
      {isAdmin && requesters.length > 1 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
          {[{ key: null as string | null, name: "All", avatar: undefined as string | undefined, count: base.length }, ...requesters].map(({ key, name, avatar, count }) => {
            const on = requesterFilter === key;
            return (
              <button
                key={key ?? "__all__"}
                onClick={() => setRequesterFilter(key)}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 11px 5px 6px",
                  borderRadius: 9999,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  fontWeight: 700,
                  border: "1px solid " + (on ? "color-mix(in srgb, var(--originator-court) 45%, transparent)" : "var(--outline-variant)"),
                  background: on ? "color-mix(in srgb, var(--originator-court) 13%, transparent)" : "var(--surface-container)",
                  color: on ? "var(--originator-court)" : "var(--on-surface-variant)",
                }}
              >
                {key === null ? (
                  <Icon name="group" size={14} color={on ? "var(--originator-court)" : "var(--on-surface-variant)"} />
                ) : (
                  <Avatar name={name} src={avatar} size={18} color="var(--originator-court)" />
                )}
                {name}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.8 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Request list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {displayed.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--on-surface-variant)",
              textAlign: "center",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="inbox" size={32} color="var(--on-surface-variant)" />
            Nothing here yet.
          </div>
        ) : (
          displayed.map((r) => (
            <ApprovalRow
              key={r.id}
              r={r}
              onReq={onAct}
              onTap={() => setReqModal({ mode: isAdmin ? "review" : "detail", request: r })}
            />
          ))
        )}
      </div>

      {/* Admin pagination hint — the snapshot only carries a page of requests */}
      {isAdmin && requestCounts && requestCounts.total > requests.length && (
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)" }}>
          Showing {requests.length} of {requestCounts.total} total requests
        </div>
      )}

      {/* FAB — request new media */}
      <button
        onClick={() => setReqModal({ mode: "request" })}
        style={{
          position: "fixed",
          bottom: 88,
          right: 20,
          zIndex: 50,
          width: 56,
          height: 56,
          borderRadius: 9999,
          border: "none",
          background: "var(--originator-court)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 16px color-mix(in srgb, var(--originator-court) 40%, transparent)",
        }}
        aria-label="Request new media"
        title="Request new media"
      >
        <Icon name="add" size={26} />
      </button>

      {reqModal && (
        <RequestModal
          open
          mode={reqModal.mode === "edit" ? "request" : reqModal.mode}
          request={reqModal.mode === "review" || reqModal.mode === "detail" ? reqModal.request : undefined}
          initialPick={reqModal.mode === "edit" && reqModal.request ? {
            id: reqModal.request.id.replace(/^os-/, ""),
            title: reqModal.request.title,
            kind: reqModal.request.kind,
            year: reqModal.request.year,
            rating: 0,
            state: reqModal.request.status,
            overview: reqModal.request.overview ?? "",
            art: reqModal.request.art,
            seasons: reqModal.request.seasons?.length ? Math.max(...reqModal.request.seasons) : undefined,
          } : undefined}
          initialSelectedSeasons={reqModal.mode === "edit" ? reqModal.request?.seasons : undefined}
          onClose={() => setReqModal(null)}
          onSubmit={handleSubmit}
          onAct={onAct}
          onEdit={reqModal.request ? () => setReqModal({ mode: "edit", request: reqModal.request }) : undefined}
          onCancel={reqModal.request ? () => handleCancel(reqModal.request!) : undefined}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}
