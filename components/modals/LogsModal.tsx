"use client";
// ============================================================
// AERIE — admin-only per-service log viewer (Loki)
// On-demand fetch of a service's recent log tail from /api/loki/logs,
// with an optional auto-refresh while open. Read-only; admin-only.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { LokiLine } from "@/lib/types";
import { Icon } from "@/components/primitives";
import { ModalShell, Toggle } from "@/components/modals/ModalShell";

const AUTO_REFRESH_MS = 5000;

const levelColor = (level?: LokiLine["level"]): string =>
  level === "error" ? "var(--error)"
  : level === "warn" ? "var(--amber)"
  : level === "debug" ? "var(--on-surface-variant)"
  : "var(--on-surface)";

// Compact local clock (HH:MM:SS) for each line; the full ISO timestamp is the title.
const clock = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour12: false });
};

export function LogsModal({
  open,
  serviceId,
  serviceName,
  logoSlug,
  onClose,
}: {
  open: boolean;
  serviceId: string;
  serviceName: string;
  logoSlug?: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<LokiLine[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [auto, setAuto] = useState(false);
  // Track the active request so a stale auto-refresh response can't clobber a newer one.
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setState((s) => (s === "ready" ? s : "loading"));
    try {
      const res = await fetch(`/api/loki/logs?serviceId=${encodeURIComponent(serviceId)}&limit=200`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LokiLine[] = await res.json();
      if (id !== reqId.current) return; // superseded
      setLines(data);
      setState("ready");
    } catch {
      if (id !== reqId.current) return;
      setState("error");
    }
  }, [serviceId]);

  // (Re)load whenever the modal opens for a (new) service; reset auto-refresh.
  useEffect(() => {
    if (!open) return;
    setLines(null);
    setState("loading");
    setAuto(false);
    void load();
  }, [open, serviceId, load]);

  // Poll while auto-refresh is on and the modal is open.
  useEffect(() => {
    if (!open || !auto) return;
    const t = setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [open, auto, load]);

  const headerActions = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
        Auto
        <Toggle on={auto} onChange={setAuto} size="sm" color="var(--primary)" />
      </label>
      <button onClick={() => void load()} className="btn btn-secondary btn-sm" style={{ padding: "5px 9px", gap: 5 }} title="Refresh logs">
        <Icon name="refresh" size={15} />
      </button>
    </div>
  );

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon="receipt_long"
      logoSlug={logoSlug}
      accent="var(--primary)"
      title={`Logs · ${serviceName}`}
      sub="Recent log tail from Loki (admin-only, read-only)."
      headerActions={headerActions}
      width={860}
    >
      <div style={{ padding: "14px 16px" }}>
        {state === "loading" && (lines === null) && (
          <div style={{ padding: "28px 0", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>
            Loading logs…
          </div>
        )}
        {state === "error" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "28px 0", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--warning)" }}>
            <Icon name="error" size={15} /> Could not load logs — check the Loki source and this service&apos;s query.
          </div>
        )}
        {state !== "error" && lines !== null && lines.length === 0 && (
          <div style={{ padding: "28px 0", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>
            No log lines in the recent window.
          </div>
        )}
        {lines !== null && lines.length > 0 && (
          <div
            className="custom-scrollbar"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              lineHeight: 1.55,
              maxHeight: "62vh",
              overflowY: "auto",
              borderRadius: 10,
              border: "1px solid var(--outline-variant)",
              background: "var(--surface-container-lowest)",
              padding: "8px 0",
            }}
          >
            {lines.map((l, i) => (
              <div
                key={`${l.tsNs}:${i}`}
                style={{ display: "flex", gap: 10, padding: "1px 14px", alignItems: "baseline" }}
              >
                <span title={l.ts} style={{ flexShrink: 0, color: "var(--on-surface-variant)", opacity: 0.8 }}>{clock(l.ts)}</span>
                <span style={{ flex: 1, minWidth: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: levelColor(l.level) }}>{l.line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
