"use client";
// ============================================================
// AERIE — Shared metrics-source controls
// Layout-light pickers + helpers used by both the desktop
// Status view and the mobile Status screen, so the
// source/instance/system selection logic stays single-sourced
// while each surface owns its own metric-card layout.
// ============================================================
import React, { useEffect, useState, useTransition } from "react";
import { useRefresh } from "@/components/portal/DataProvider";
import { setPrometheusInstance, setMetricsSource, setBeszelSystem } from "@/app/(portal)/admin/actions";

/** Shared style for the metrics-section pickers (node instance / Beszel system). */
export const PICKER_SELECT_STYLE: React.CSSProperties = {
  marginLeft: "auto",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid var(--outline-variant)",
  background: "var(--surface-container)",
  color: "var(--on-surface)",
  cursor: "pointer",
};

/** seconds → compact uptime ("12d 4h", "4h 12m", "12m"). */
export function fmtUptime(sec: number | null): string {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Live-age label for the latest metrics read ("live" within 5s, else "Ns ago"). */
export function useSecondsAgo(dep: unknown): string {
  const [lastSeen, setLastSeen] = useState(() => Date.now());
  const [ago, setAgo] = useState(0);
  useEffect(() => { setLastSeen(Date.now()); setAgo(0); }, [dep]);
  useEffect(() => {
    const t = setInterval(() => setAgo(Math.floor((Date.now() - lastSeen) / 1000)), 1000);
    return () => clearInterval(t);
  }, [lastSeen]);
  return ago < 5 ? "live" : `${ago}s ago`;
}

/** Prometheus node-instance picker. Renders nothing until instances are discovered. */
export function InstanceSelect({ current }: { current: string | null }) {
  const refresh = useRefresh();
  const [instances, setInstances] = useState<string[]>([]);
  const [value, setValue] = useState<string>(current ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => { setValue(current ?? ""); }, [current]);

  useEffect(() => {
    fetch("/api/prometheus/instances", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: string[]) => setInstances(d))
      .catch(() => {});
  }, []);

  if (instances.length === 0) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);
    startTransition(async () => {
      await setPrometheusInstance(next === "" ? null : next);
      refresh();
    });
  }

  return (
    <select value={value} onChange={handleChange} disabled={pending} style={{ ...PICKER_SELECT_STYLE, opacity: pending ? 0.5 : 1 }}>
      <option value="">All nodes</option>
      {instances.map((inst) => (
        <option key={inst} value={inst}>{inst}</option>
      ))}
    </select>
  );
}

/** Segmented Prometheus ⇄ Beszel toggle, shown only when both sources are configured. */
export function SourceToggle({ current }: { current: "prometheus" | "beszel" }) {
  const refresh = useRefresh();
  const [pending, startTransition] = useTransition();
  const pick = (src: "prometheus" | "beszel") => {
    if (src === current || pending) return;
    startTransition(async () => {
      await setMetricsSource(src);
      refresh();
    });
  };
  const opts: { id: "prometheus" | "beszel"; label: string }[] = [
    { id: "prometheus", label: "Prometheus" },
    { id: "beszel", label: "Beszel" },
  ];
  return (
    <div style={{ display: "inline-flex", borderRadius: 6, border: "1px solid var(--outline-variant)", overflow: "hidden", opacity: pending ? 0.5 : 1 }}>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => pick(o.id)}
          disabled={pending}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            padding: "3px 9px",
            border: "none",
            cursor: o.id === current ? "default" : "pointer",
            background: o.id === current ? "var(--primary)" : "var(--surface-container)",
            color: o.id === current ? "var(--on-primary)" : "var(--on-surface-variant)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Beszel system picker — option value = system id, label = system name. */
export function BeszelSystemSelect({ current }: { current: string | null }) {
  const refresh = useRefresh();
  const [systems, setSystems] = useState<{ id: string; name: string; status: string }[]>([]);
  const [value, setValue] = useState<string>(current ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => { setValue(current ?? ""); }, [current]);

  useEffect(() => {
    fetch("/api/beszel/systems", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { id: string; name: string; status: string }[]) => setSystems(d))
      .catch(() => {});
  }, []);

  if (systems.length === 0) return null;
  // Reflect the effective selection: the persisted id, else the first system.
  const effective = value || systems[0]?.id || "";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);
    startTransition(async () => {
      await setBeszelSystem(next || null);
      refresh();
    });
  }

  return (
    <select value={effective} onChange={handleChange} disabled={pending} style={{ ...PICKER_SELECT_STYLE, opacity: pending ? 0.5 : 1 }}>
      {systems.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
