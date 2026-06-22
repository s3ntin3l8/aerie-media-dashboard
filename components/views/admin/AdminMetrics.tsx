"use client";
// ============================================================
// AERIE — Admin · Metrics Settings sub-view
// Controls which source (Prometheus / Beszel) fills the System
// Metrics cards on /services, and which host/system is selected.
// The display cards themselves live on /services; this tab is
// admin-only configuration only.
// ============================================================
import React from "react";
import { Icon, Eyebrow } from "@/components/primitives";
import { PanelShell } from "@/components/panels";
import { useData } from "@/components/portal/DataProvider";
import { SourceToggle, InstanceSelect, BeszelSystemSelect } from "@/components/status/metricsControls";

export function AdminMetrics({ isMobile }: { isMobile: boolean }) {
  const { metrics, metricsSource, prometheusConfigured, beszelConfigured, beszelSystemId } = useData();
  const bothConfigured = prometheusConfigured && beszelConfigured;
  const anyConfigured = prometheusConfigured || beszelConfigured;
  void isMobile; // reserved for future mobile-specific layout

  if (!anyConfigured) {
    return (
      <PanelShell title="Metrics Source" icon="monitoring" accent="var(--primary)">
        <div style={{ padding: "14px 16px", color: "var(--on-surface-variant)", fontSize: 13 }}>
          No metrics source configured. Add a <strong>Prometheus</strong> or <strong>Beszel</strong> service in{" "}
          <em>Services &amp; Secrets</em> with its API key set to light up the System Metrics cards on{" "}
          <em>/services</em>.
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Metrics Source" icon="monitoring" accent="var(--primary)">
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ color: "var(--on-surface-variant)", fontSize: 12.5, lineHeight: 1.5 }}>
          Choose which source drives the System Metrics cards on <em>/services</em>, and optionally
          pin a specific host or system.
        </div>

        {/* Source toggle — only shown when both sources are configured */}
        {bothConfigured && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Eyebrow>Source</Eyebrow>
            <SourceToggle current={metricsSource} />
          </div>
        )}

        {/* Host / system selector for the active source */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Eyebrow>{metricsSource === "beszel" ? "System" : "Instance"}</Eyebrow>
          {metricsSource === "beszel" ? (
            <BeszelSystemSelect current={beszelSystemId} />
          ) : (
            <InstanceSelect current={metrics?.instance ?? null} />
          )}
          {metricsSource === "prometheus" && !prometheusConfigured && (
            <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              Prometheus not configured
            </span>
          )}
          {metricsSource === "beszel" && !beszelConfigured && (
            <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              Beszel not configured
            </span>
          )}
        </div>

        {/* Active source indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4, borderTop: "1px solid var(--outline-variant)" }}>
          <Icon name={metricsSource === "beszel" ? "dns" : "query_stats"} size={14} color="var(--on-surface-variant)" />
          <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
            Active source:{" "}
            <strong style={{ color: "var(--on-surface)" }}>
              {metricsSource === "beszel" ? "Beszel" : "Prometheus"}
            </strong>
          </span>
        </div>
      </div>
    </PanelShell>
  );
}
