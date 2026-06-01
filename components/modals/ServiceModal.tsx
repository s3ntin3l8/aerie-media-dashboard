"use client";
// ============================================================
// AERIE — Service add/edit modal (ported from ServiceModal.jsx)
// Wired to real server actions by the Admin view. Key field is
// blank-means-keep in edit mode to avoid overwriting the secret.
// ============================================================
import React, { useEffect, useState } from "react";
import type { Service } from "@/lib/types";
import { Icon, Divider, Heartbeat, StatusDot, catColor } from "@/components/primitives";
import { ModalShell, SectionLabel, Field, ToggleRow, Toggle, CatPicker, fieldInput } from "@/components/modals/ModalShell";
import { IconPicker } from "@/components/modals/IconPicker";

export interface ServiceForm {
  name: string;
  cat: string;
  icon: string;
  logoSlug: string;
  scheme: "https" | "http";
  host: string;
  version: string;
  embeddable: boolean;
  central: boolean;
  centralLabel: string;
  note: string;
  apiKey: string;
  monitoringKey: string;
}

interface GatusEndpoint { key: string; name: string; group?: string }

function MonitoringKeyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [endpoints, setEndpoints] = useState<GatusEndpoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch("/api/gatus-endpoints")
      .then((r) => r.ok ? r.json() : [])
      .then((data: GatusEndpoint[]) => { if (!ignore) { setEndpoints(data); setLoading(false); } })
      .catch(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  if (loading) return (
    <span style={{ fontSize: 11.5, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)" }}>
      Loading endpoints…
    </span>
  );
  if (endpoints.length === 0) return (
    <span style={{ fontSize: 11.5, color: "var(--on-surface-variant)" }}>
      No Gatus endpoints found — configure Gatus first.
    </span>
  );
  const knownKeys = new Set(endpoints.map((e) => e.key));
  const orphan = value && !knownKeys.has(value) ? value : null;
  return (
    <Field label="Gatus endpoint">
      <select className="input" style={fieldInput} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Auto-detect (by name)</option>
        {orphan && <option value={orphan}>{orphan} (stored — not in current list)</option>}
        {endpoints.map((ep) => (
          <option key={ep.key} value={ep.key}>
            {ep.group ? `${ep.group} / ${ep.name}` : ep.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

const isIcon = (s: string) => /^[a-z_]+$/.test(s);

// Known service presets applied to blank fields when the name matches.
const SERVICE_PRESETS: Record<string, { cat: string; icon: string; logoSlug: string }> = {
  jellyfin:      { cat: "stream",     icon: "smart_display", logoSlug: "jellyfin" },
  emby:          { cat: "stream",     icon: "smart_display", logoSlug: "emby" },
  plex:          { cat: "stream",     icon: "smart_display", logoSlug: "plex" },
  tautulli:      { cat: "monitor",    icon: "bar_chart",     logoSlug: "tautulli" },
  overseerr:     { cat: "request",    icon: "add_circle",    logoSlug: "overseerr" },
  jellyseerr:    { cat: "request",    icon: "add_circle",    logoSlug: "jellyseerr" },
  sonarr:        { cat: "automation", icon: "live_tv",       logoSlug: "sonarr" },
  radarr:        { cat: "automation", icon: "movie",         logoSlug: "radarr" },
  lidarr:        { cat: "automation", icon: "library_music", logoSlug: "lidarr" },
  readarr:       { cat: "automation", icon: "menu_book",     logoSlug: "readarr" },
  prowlarr:      { cat: "automation", icon: "search",        logoSlug: "prowlarr" },
  bazarr:        { cat: "automation", icon: "subtitles",     logoSlug: "bazarr" },
  whisparr:      { cat: "automation", icon: "movie",         logoSlug: "whisparr" },
  gatus:         { cat: "monitor",    icon: "monitor_heart", logoSlug: "gatus" },
  prometheus:    { cat: "infra",      icon: "query_stats",   logoSlug: "prometheus" },
  grafana:       { cat: "infra",      icon: "monitoring",    logoSlug: "grafana" },
  portainer:     { cat: "infra",      icon: "dns",           logoSlug: "portainer" },
  nextcloud:     { cat: "infra",      icon: "cloud",         logoSlug: "nextcloud" },
  homeassistant: { cat: "infra",      icon: "home",          logoSlug: "home-assistant" },
  uptimekuma:    { cat: "monitor",    icon: "monitor_heart", logoSlug: "uptime-kuma" },
};

function matchPreset(name: string) {
  const key = name.toLowerCase().replace(/[\s\-_.]/g, "");
  return SERVICE_PRESETS[key] ?? null;
}

type ConnStatus = { state: "idle" } | { state: "testing" } | { state: "ok"; version: string | null } | { state: "err" };

export function ServiceModal({
  open,
  mode,
  service,
  groups,
  adminGroup,
  initialVisibility,
  onClose,
  onSave,
  onDelete,
  onDetectVersion,
  onTestConnection,
}: {
  open: boolean;
  mode: "add" | "edit";
  service?: Service | null;
  groups: { name: string }[];
  adminGroup: string;
  initialVisibility: Record<string, boolean>;
  onClose: () => void;
  onSave: (form: ServiceForm, vis: Record<string, boolean>) => void;
  onDelete: (service: Service) => void;
  onDetectVersion?: (baseUrl: string, apiKey: string, name: string) => Promise<string | null>;
  onTestConnection?: (baseUrl: string, apiKey: string, name: string) => Promise<string | null>;
}) {
  const editing = mode === "edit";

  const blank = (): ServiceForm => ({
    name: "",
    cat: "stream",
    icon: "dns",
    logoSlug: "",
    scheme: "https",
    host: "",
    version: "",
    embeddable: true,
    central: false,
    centralLabel: "",
    note: "",
    apiKey: "",
    monitoringKey: "",
  });
  const init = (): ServiceForm => {
    if (editing && service) {
      return {
        ...blank(),
        name: service.name,
        cat: service.cat,
        icon: service.icon,
        logoSlug: service.logoSlug ?? "",
        scheme: service.scheme,
        host: service.host,
        version: service.version || "",
        embeddable: service.embeddable,
        central: Boolean(service.central),
        centralLabel: service.centralLabel || "",
        note: service.note || "",
        apiKey: "", // blank = keep existing secret (never pre-fill it)
        monitoringKey: service.monitoringKey ?? "",
      };
    }
    return blank();
  };

  const [f, setF] = useState<ServiceForm>(init);
  const [vis, setVis] = useState<Record<string, boolean>>(initialVisibility);
  const [revealKey, setRevealKey] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>({ state: "idle" });

  useEffect(() => {
    if (open) {
      setF(init());
      setVis(initialVisibility);
      setRevealKey(false);
      setDetecting(false);
      setConnStatus({ state: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id, mode]);

  const handleDetect = async () => {
    if (!onDetectVersion || detecting) return;
    setDetecting(true);
    try {
      const v = await onDetectVersion(`${f.scheme}://${f.host}`, f.apiKey, f.name);
      if (v) set("version", v);
    } finally {
      setDetecting(false);
    }
  };
  const canDetect = Boolean(onDetectVersion) && (editing || f.host.trim() !== "");

  const handleTest = async () => {
    if (!onTestConnection) return;
    setConnStatus({ state: "testing" });
    const result = await onTestConnection(`${f.scheme}://${f.host}`, f.apiKey, f.name);
    setConnStatus(result !== null ? { state: "ok", version: result } : { state: "err" });
  };
  const canTest = Boolean(onTestConnection) && (editing || (f.host.trim() !== "" && f.apiKey.trim() !== ""));

  const set = <K extends keyof ServiceForm>(k: K, v: ServiceForm[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const c = catColor(f.cat as Service["cat"]);
  const canSave = f.name.trim() !== "" && f.host.trim() !== "";

  const footer = (
    <>
      {editing && service ? (
        <button onClick={() => onDelete(service)} className="btn btn-danger btn-sm" style={{ marginRight: "auto" }}>
          <Icon name="delete" size={15} /> Remove
        </button>
      ) : (
        <span style={{ marginRight: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>Secrets sealed with AES-GCM</span>
      )}
      <button onClick={onClose} className="btn btn-secondary btn-sm">
        Cancel
      </button>
      <button onClick={() => canSave && onSave(f, vis)} disabled={!canSave} className="btn btn-primary btn-sm">
        <Icon name={editing ? "check" : "add"} size={15} />
        {editing ? "Save changes" : "Add service"}
      </button>
    </>
  );

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      accent={c}
      icon={isIcon(f.icon) ? f.icon : "dns"}
      title={editing ? `Edit ${service ? service.name : "service"}` : "Add a service"}
      sub={editing ? "Update connection details, secrets and who can see it." : "Register a self-hosted app so it appears on the portal."}
      footer={footer}
      width={620}
    >
      <div style={{ padding: "18px 20px 22px", display: "flex", flexDirection: "column", gap: 22 }}>
        {/* IDENTITY */}
        <section>
          <SectionLabel>Identity</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
              <Field label="Service name">
                <input
                  className="input"
                  style={fieldInput}
                  value={f.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    if (!editing) {
                      const preset = matchPreset(name);
                      if (preset) {
                        setF((prev) => ({
                          ...prev,
                          name,
                          cat: prev.cat === "stream" ? preset.cat : prev.cat,
                          icon: prev.icon === "dns" ? preset.icon : prev.icon,
                          logoSlug: prev.logoSlug === "" ? preset.logoSlug : prev.logoSlug,
                        }));
                        return;
                      }
                    }
                    set("name", name);
                  }}
                  placeholder="e.g. Jellyfin"
                  autoFocus={!editing}
                />
              </Field>
              <Field label="Version" hint="opt.">
                <div style={{ display: "flex", gap: 7 }}>
                  <input className="input" style={{ ...fieldInput, fontFamily: "var(--font-mono)", flex: 1, minWidth: 0 }} value={f.version} onChange={(e) => set("version", e.target.value)} placeholder="1.0.0" />
                  <button type="button" onClick={handleDetect} disabled={!canDetect || detecting} className="btn btn-secondary btn-sm" style={{ padding: "0 10px", flexShrink: 0 }} title="Auto-detect version from service API">
                    {detecting ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>…</span> : <Icon name="auto_awesome" size={14} />}
                  </button>
                </div>
              </Field>
            </div>
            <Field label="Category">
              <CatPicker value={f.cat} onChange={(v) => set("cat", v)} />
            </Field>
            <Field label="Host">
                <div style={{ display: "flex", gap: 7 }}>
                  <select className="input" value={f.scheme} onChange={(e) => set("scheme", e.target.value as "https" | "http")} style={{ ...fieldInput, fontFamily: "var(--font-mono)", width: "auto", flexShrink: 0 }}>
                    <option value="https">https://</option>
                    <option value="http">http://</option>
                  </select>
                  <input className="input" style={{ ...fieldInput, fontFamily: "var(--font-mono)", flex: 1, minWidth: 0 }} value={f.host} onChange={(e) => set("host", e.target.value)} placeholder="host.example.com" />
                </div>
            </Field>
            <Field label="Internal note" hint="shown to admins only">
              <input className="input" style={fieldInput} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="What is this service for?" />
            </Field>
          </div>
        </section>

        <Divider />

        {/* SERVICE LOGO */}
        <section>
          <SectionLabel hint="optional — from dashboard-icons">Service logo</SectionLabel>
          <IconPicker value={f.logoSlug} onChange={(v) => set("logoSlug", v)} catColor={c} />
        </section>

        <Divider />

        {/* ACCESS & SECRETS */}
        <section>
          <SectionLabel>Access &amp; secrets</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ToggleRow
              on={f.embeddable}
              onChange={(v) => set("embeddable", v)}
              color="var(--originator-own)"
              icon={f.embeddable ? "fullscreen" : "open_in_new"}
              title="Embed inside the portal"
              desc={f.embeddable ? "Renders in an in-portal frame via forward-auth." : "Opens in a new browser tab — frame-ancestors blocked."}
            />
            <Field label="API key" hint={editing ? "leave blank to keep current key" : "encrypted at rest"}>
              <div style={{ display: "flex", gap: 7 }}>
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  <Icon name="key" size={15} color="var(--originator-own)" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    className="input"
                    type={revealKey ? "text" : "password"}
                    style={{ ...fieldInput, paddingLeft: 34, fontFamily: "var(--font-mono)" }}
                    value={f.apiKey}
                    onChange={(e) => set("apiKey", e.target.value)}
                    placeholder={editing ? "•••••••• (unchanged)" : "paste service API key"}
                  />
                </div>
                <button type="button" onClick={() => setRevealKey((r) => !r)} className="btn btn-secondary btn-sm" style={{ padding: "0 11px" }} title={revealKey ? "Hide" : "Reveal"}>
                  <Icon name={revealKey ? "visibility_off" : "visibility"} size={16} />
                </button>
                <button type="button" onClick={handleTest} disabled={!canTest || connStatus.state === "testing"} className="btn btn-secondary btn-sm" style={{ padding: "0 11px" }} title="Test connection">
                  {connStatus.state === "testing" ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>…</span> : <Icon name="wifi_find" size={16} />}
                </button>
              </div>
              {connStatus.state !== "idle" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {connStatus.state === "testing" && <span style={{ color: "var(--on-surface-variant)" }}>Testing…</span>}
                  {connStatus.state === "ok" && (
                    <>
                      <StatusDot status="up" size={7} />
                      <span style={{ color: "var(--on-surface)" }}>
                        Connected{connStatus.version ? ` · v${connStatus.version}` : ""}
                      </span>
                    </>
                  )}
                  {connStatus.state === "err" && (
                    <>
                      <StatusDot status="down" size={7} />
                      <span style={{ color: "var(--on-surface-variant)" }}>Could not connect — check host and API key</span>
                    </>
                  )}
                </div>
              )}
            </Field>
          </div>
        </section>

        <Divider />

        {/* MONITORING SOURCE (Gatus owns probing — live heartbeat shown when editing) */}
        <section>
          <SectionLabel hint={editing && service ? `${service.uptime}% · last probe ${service.ms}ms` : "which Gatus endpoint tracks this service"}>Monitoring source</SectionLabel>
          <MonitoringKeyPicker value={f.monitoringKey} onChange={(v) => set("monitoringKey", v)} />
          {editing && service && service.beats && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)" }}>
              <Heartbeat beats={service.beats.slice(-22)} h={18} barW={3} />
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
                <StatusDot status={service.status} size={7} />
                {service.status === "unknown" ? "no data" : `${service.uptime}% · ${service.status}`}
              </span>
            </div>
          )}
        </section>

        <Divider />

        {/* SPOTLIGHT */}
        <section>
          <SectionLabel>Central-services spotlight</SectionLabel>
          <ToggleRow on={f.central} onChange={(v) => set("central", v)} color="var(--primary)" icon="bolt" title="Feature on the dashboard spotlight" desc="Pin this service to the top-of-portal quick-launch row." />
          {f.central && (
            <div className="fade-in" style={{ marginTop: 10 }}>
              <Field label="Spotlight label" hint="short verb — e.g. Stream, Requests">
                <input className="input" style={fieldInput} value={f.centralLabel} onChange={(e) => set("centralLabel", e.target.value)} placeholder="Stream" maxLength={16} />
              </Field>
            </div>
          )}
        </section>

        <Divider />

        {/* VISIBILITY */}
        <section>
          <SectionLabel hint="who sees it on their portal">Visibility</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.map((g) => {
              const locked = g.name === adminGroup;
              return (
                <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)" }}>
                  <Icon name="group" size={16} color="var(--on-surface-variant)" />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--on-surface)" }}>{g.name}</span>
                  {locked ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>
                      <Icon name="lock" size={12} />
                      always
                    </span>
                  ) : (
                    <Toggle on={vis[g.name] ?? false} onChange={(v) => setVis((p) => ({ ...p, [g.name]: v }))} size="sm" color="var(--originator-court)" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </ModalShell>
  );
}
