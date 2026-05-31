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

export interface ServiceForm {
  name: string;
  cat: string;
  icon: string;
  host: string;
  version: string;
  embeddable: boolean;
  central: boolean;
  centralLabel: string;
  note: string;
  healthUrl: string;
  interval: string;
  apiKey: string;
}

const isIcon = (s: string) => /^[a-z_]+$/.test(s);

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
}) {
  const editing = mode === "edit";

  const blank = (): ServiceForm => ({
    name: "",
    cat: "stream",
    icon: "dns",
    host: "",
    version: "",
    embeddable: true,
    central: false,
    centralLabel: "",
    note: "",
    healthUrl: "",
    interval: "60",
    apiKey: "",
  });
  const init = (): ServiceForm => {
    if (editing && service) {
      return {
        ...blank(),
        name: service.name,
        cat: service.cat,
        icon: service.icon,
        host: service.host,
        version: service.version || "",
        embeddable: service.embeddable,
        central: Boolean(service.central),
        centralLabel: service.centralLabel || "",
        note: service.note || "",
        healthUrl: `https://${service.host}/health`,
        interval: "60",
        apiKey: "", // blank = keep existing secret (never pre-fill it)
      };
    }
    return blank();
  };

  const [f, setF] = useState<ServiceForm>(init);
  const [vis, setVis] = useState<Record<string, boolean>>(initialVisibility);
  const [revealKey, setRevealKey] = useState(false);

  useEffect(() => {
    if (open) {
      setF(init());
      setVis(initialVisibility);
      setRevealKey(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id, mode]);

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
                <input className="input" style={fieldInput} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Jellyfin" autoFocus={!editing} />
              </Field>
              <Field label="Version" hint="opt.">
                <input className="input" style={{ ...fieldInput, fontFamily: "var(--font-mono)" }} value={f.version} onChange={(e) => set("version", e.target.value)} placeholder="1.0.0" />
              </Field>
            </div>
            <Field label="Category">
              <CatPicker value={f.cat} onChange={(v) => set("cat", v)} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12 }}>
              <Field label="Icon" hint="symbol">
                <div style={{ position: "relative", minWidth: 0 }}>
                  <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
                    <Icon name={isIcon(f.icon) ? f.icon : "help"} size={15} color={c} />
                  </span>
                  <input className="input" style={{ ...fieldInput, paddingLeft: 40, fontFamily: "var(--font-mono)" }} value={f.icon} onChange={(e) => set("icon", e.target.value)} placeholder="smart_display" />
                </div>
              </Field>
              <Field label="Host">
                <input className="input" style={{ ...fieldInput, fontFamily: "var(--font-mono)" }} value={f.host} onChange={(e) => set("host", e.target.value)} placeholder="jellyfin.example.com" />
              </Field>
            </div>
            <Field label="Internal note" hint="shown to admins only">
              <input className="input" style={fieldInput} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="What is this service for?" />
            </Field>
          </div>
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
              </div>
            </Field>
          </div>
        </section>

        <Divider />

        {/* HEALTH CHECK (display only — Gatus owns probing) */}
        <section>
          <SectionLabel hint={editing && service ? `last probe ${service.ms}ms` : "Gatus probe"}>Health check</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 12 }}>
            <Field label="Check URL">
              <input className="input" style={{ ...fieldInput, fontFamily: "var(--font-mono)" }} value={f.healthUrl} onChange={(e) => set("healthUrl", e.target.value)} placeholder="https://host/health" />
            </Field>
            <Field label="Interval">
              <select className="input" style={fieldInput} value={f.interval} onChange={(e) => set("interval", e.target.value)}>
                <option value="30">Every 30s</option>
                <option value="60">Every 1 min</option>
                <option value="300">Every 5 min</option>
                <option value="900">Every 15 min</option>
              </select>
            </Field>
          </div>
          {editing && service && service.beats && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)" }}>
              <Heartbeat beats={service.beats.slice(-22)} h={18} barW={3} />
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
                <StatusDot status={service.status} size={7} />
                {service.uptime}% · {service.status}
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
