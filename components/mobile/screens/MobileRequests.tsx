"use client";
import React, { useState } from "react";
import { Icon, Eyebrow } from "@/components/primitives";
import { useData, useRefresh } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { ApprovalRow, MiniStat } from "@/components/mobile/mcommon";
import { useRequestReview } from "@/components/hooks/useRequestReview";
import { RequestModal } from "@/components/modals/RequestModal";
import { Toast } from "@/components/modals/Toast";
import { submitRequest } from "@/app/(portal)/requests/actions";
import type { DiscoverItem, MediaRequest, RequestStatus } from "@/lib/types";

type Filter = "all" | RequestStatus;

export function MobileRequests() {
  const { requests } = useData();
  const { role, user } = usePortal();
  const [filter, setFilter] = useState<Filter>("all");
  const { acted, onAct, applyActed } = useRequestReview();
  const refresh = useRefresh();
  const [reqModal, setReqModal] = useState<{ mode: "request" | "review"; request?: MediaRequest } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const handleSubmit = (pick: DiscoverItem, quality: string, seasons: Record<number, boolean>) => {
    const picked = Object.keys(seasons).filter((k) => seasons[Number(k)]).map(Number);
    void submitRequest(pick, picked, quality).then((r) => { flash(r.message); refresh(); });
  };

  const base =
    role === "admin"
      ? requests
      : requests.filter((r) => r.portalUser === user.id);

  // Apply optimistic overlay, then filter out declined for display
  const displayed = applyActed(base).filter(
    (r) =>
      r.status !== "declined" &&
      (filter === "all" || r.status === filter)
  );

  const counts = {
    pending: base.filter(
      (r) => (acted[r.id] ?? r.status) === "pending"
    ).length,
    approved: base.filter(
      (r) => (acted[r.id] ?? r.status) === "approved"
    ).length,
    available: base.filter((r) => r.status === "available").length,
    all: base.filter((r) => r.status !== "declined").length,
  };

  const filters: [Filter, string, number][] = [
    ["all", "All", counts.all],
    ["pending", "Pending", counts.pending],
    ["approved", "Approved", counts.approved],
    ["available", "Available", counts.available],
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
          {role === "admin" ? "Overseerr · All members" : "Overseerr · Your library"}
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

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 8,
        }}
      >
        <MiniStat
          label="Pending"
          value={counts.pending}
          icon="pending"
          color="var(--amber)"
        />
        <MiniStat
          label="Approved"
          value={counts.approved}
          icon="check_circle"
          color="var(--originator-court)"
        />
        <MiniStat
          label="Avail."
          value={counts.available}
          icon="task_alt"
          color="var(--originator-own)"
        />
        <MiniStat
          label="Total"
          value={counts.all}
          icon="list"
          color="var(--on-surface-variant)"
        />
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {filters.map(([id, label, n]) => {
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
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  opacity: 0.8,
                }}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

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
            <Icon
              name="inbox"
              size={32}
              color="var(--on-surface-variant)"
            />
            Nothing here yet.
          </div>
        ) : (
          displayed.map((r) => (
            <ApprovalRow
              key={r.id}
              r={r}
              onReq={onAct}
              onTap={role === "admin" ? () => setReqModal({ mode: "review", request: r }) : undefined}
            />
          ))
        )}
      </div>

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
          mode={reqModal.mode}
          request={reqModal.mode === "review" ? reqModal.request : undefined}
          onClose={() => setReqModal(null)}
          onSubmit={handleSubmit}
          onAct={onAct}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}
