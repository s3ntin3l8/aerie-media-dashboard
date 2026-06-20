"use client";
// ============================================================
// AERIE — Service add/edit modal (ported from ServiceModal.jsx)
// Wired to real server actions by the Admin view. Key field is
// blank-means-keep in edit mode to avoid overwriting the secret.
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import type { Category, Service } from "@/lib/types";
import { defaultVisibleToMembers } from "@/lib/visibility";
import { Icon, Divider, Heartbeat, StatusDot, catColor } from "@/components/primitives";
import { ModalShell, SectionLabel, Field, ToggleRow, Toggle, CatPicker, fieldInput } from "@/components/modals/ModalShell";
import { IconPicker } from "@/components/modals/IconPicker";
import { usePortal } from "@/components/portal/PortalProvider";
import { matchPreset } from "@/lib/servicePresets";

export interface ServiceForm {
  name: string;
  cat: string;
  icon: string;
  logoSlug: string;
  scheme: "https" | "http";
  host: string;
  internalScheme: "https" | "http";
  internalUrl: string;
  insecureTls: boolean;
  version: string;
  embeddable: boolean;
  keepAlive: boolean;
  active: boolean;
  central: boolean;
  centralLabel: string;
  note: string;
  apiKey: string;
  monitoringKey: string;
  lokiQuery: string;
  containerName: string;
  portainerEndpointId: string;
  // Forward-auth (authentik) — auth THROUGH a reverse-proxy outpost. "" = keep current /
  // none, "remove" = clear stored config. The credential fields are blank-means-keep in
  // edit mode (like apiKey), serialized to a `forwardAuth`-kind secret by the Admin view.
  forwardAuthMethod: "" | "basic" | "bearer" | "remove";
  forwardAuthTokenUrl: string;
  forwardAuthClientId: string;
  forwardAuthUsername: string;
  forwardAuthPassword: string;
  forwardAuthScope: string;
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
  onSaveAndTest,
  onTestSaved,
  prefill,
  lokiConfigured = false,
  portainerConfigured = false,
}: {
  open: boolean;
  mode: "add" | "edit";
  service?: Service | null;
  /** Add-mode: seed the blank form (e.g. host/scheme/name from a discovered Traefik router). */
  prefill?: Partial<ServiceForm>;
  /** True when an active Loki source exists → show the optional per-service log selector field. */
  lokiConfigured?: boolean;
  /** True when a Portainer instance is configured → show the optional container-name / endpoint
   *  fields that enable the admin-only restart control for this service. */
  portainerConfigured?: boolean;
  groups: { name: string }[];
  adminGroup: string;
  initialVisibility: Record<string, boolean>;
  onClose: () => void;
  onSave: (form: ServiceForm, vis: Record<string, boolean>) => void;
  onDelete: (service: Service) => void;
  onDetectVersion?: (baseUrl: string, apiKey: string, name: string, insecureTls: boolean) => Promise<string | null>;
  onTestConnection?: (baseUrl: string, apiKey: string, name: string, insecureTls: boolean) => Promise<string | null>;
  /** Add-mode: persist the service (config + secret + visibility) without closing, returns its id (null on failure). */
  onSaveAndTest?: (form: ServiceForm, vis: Record<string, boolean>) => Promise<string | null>;
  /** Test the stored connection for a saved service by id. */
  onTestSaved?: (id: string) => Promise<string | null>;
}) {
  const editing = mode === "edit";
  const { favorites, toggleFavorite } = usePortal();

  const blank = (): ServiceForm => ({
    name: "",
    cat: "stream",
    icon: "dns",
    logoSlug: "",
    scheme: "https",
    host: "",
    internalScheme: "http",
    internalUrl: "",
    insecureTls: false,
    version: "",
    embeddable: true,
    keepAlive: false,
    active: true,
    central: false,
    centralLabel: "",
    note: "",
    apiKey: "",
    monitoringKey: "",
    lokiQuery: "",
    containerName: "",
    portainerEndpointId: "",
    forwardAuthMethod: "",
    forwardAuthTokenUrl: "",
    forwardAuthClientId: "",
    forwardAuthUsername: "",
    forwardAuthPassword: "",
    forwardAuthScope: "",
  });
  // stored internalUrl is a full URL ("http://host:port"); split for the two-input form
  const splitInternal = (u?: string): { scheme: "https" | "http"; rest: string } => {
    if (!u) return { scheme: "http", rest: "" }; // default scheme http
    const m = /^(https?):\/\/(.*)$/i.exec(u.trim());
    return m ? { scheme: m[1].toLowerCase() as "https" | "http", rest: m[2] } : { scheme: "http", rest: u.trim() };
  };
  const init = (): ServiceForm => {
    if (editing && service) {
      const internal = splitInternal(service.internalUrl);
      // Seed the forward-auth controls from the stored (non-secret) config so the dropdown opens
      // on the real method and the account fields reflect what's configured. The password is never
      // surfaced — it stays blank ("keep current") unless the admin re-enters it.
      const fa = service.forwardAuthConfig;
      return {
        ...blank(),
        name: service.name,
        cat: service.cat,
        icon: service.icon,
        logoSlug: service.logoSlug ?? "",
        scheme: service.scheme,
        host: service.host,
        internalScheme: internal.scheme,
        internalUrl: internal.rest, // seed from stored value so edits don't clobber the LAN URL
        insecureTls: service.insecureTls ?? false,
        version: service.version || "",
        embeddable: service.embeddable,
        keepAlive: service.keepAlive,
        active: service.active,
        central: Boolean(service.central),
        centralLabel: service.centralLabel || "",
        note: service.note || "",
        apiKey: "", // blank = keep existing secret (never pre-fill it)
        monitoringKey: service.monitoringKey ?? "",
        lokiQuery: service.lokiQuery ?? "",
        containerName: service.containerName ?? "",
        portainerEndpointId: service.portainerEndpointId ?? "",
        forwardAuthMethod: fa?.method ?? "",
        forwardAuthTokenUrl: fa?.tokenUrl ?? "",
        forwardAuthClientId: fa?.clientId ?? "",
        forwardAuthUsername: fa?.username ?? "",
        forwardAuthScope: fa?.scope ?? "",
        // forwardAuthPassword stays "" (blank = keep existing secret, never pre-filled)
      };
    }
    return { ...blank(), ...(prefill ?? {}) };
  };

  const [f, setF] = useState<ServiceForm>(init);
  const [vis, setVis] = useState<Record<string, boolean>>(initialVisibility);
  const [revealKey, setRevealKey] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>({ state: "idle" });
  // Tracks whether the admin manually changed a visibility toggle in this session,
  // so the category-driven default (below) stops overriding their explicit choice.
  const visTouched = useRef(false);

  useEffect(() => {
    if (open) {
      setF(init());
      setVis(initialVisibility);
      visTouched.current = false;
      setRevealKey(false);
      setDetecting(false);
      setConnStatus({ state: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id, mode, prefill?.host]);

  // Category-driven default for the member ("friends") group when ADDING a service:
  // streaming/requests default visible, infra/monitoring/automation default admin-only.
  // Re-seeds when the admin changes the category (or a name preset flips it), unless
  // they've already toggled visibility by hand. Edits keep the stored visibility.
  useEffect(() => {
    if (!open || editing || visTouched.current) return;
    setVis((p) => ({ ...p, friends: defaultVisibleToMembers(f.cat as Category) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.cat, open]);

  // The server calls the internal/LAN URL when set; mirror that here so the test/detect
  // probes the same endpoint the snapshot will actually hit.
  const apiUrl = () => {
    const rest = f.internalUrl.trim();
    return rest ? `${f.internalScheme}://${rest}` : `${f.scheme}://${f.host}`;
  };

  const handleDetect = async () => {
    if (!onDetectVersion || detecting) return;
    setDetecting(true);
    try {
      const v = await onDetectVersion(apiUrl(), f.apiKey, f.name, f.insecureTls);
      if (v) set("version", v);
    } finally {
      setDetecting(false);
    }
  };
  const canDetect = Boolean(onDetectVersion) && (editing || f.host.trim() !== "");

  const handleTest = async () => {
    setConnStatus({ state: "testing" });
    let result: string | null;
    if (onSaveAndTest && onTestSaved) {
      // Persist first (config + secret), then test the *stored* connection, so the test
      // reflects exactly what the server will hit — including edited URLs. Testing a
      // typed-but-unsaved key is unreliable, and in edit mode the previous "test stored
      // creds" path silently ignored unsaved URL edits (e.g. clearing the internal URL).
      // A blank key field keeps the existing secret (persistService only writes a secret
      // when one was typed), so save-then-test never clobbers it.
      const id = await onSaveAndTest(f, vis);
      if (!id) { setConnStatus({ state: "err" }); return; }
      result = await onTestSaved(id);
    } else if (onTestConnection) {
      result = await onTestConnection(apiUrl(), f.apiKey, f.name, f.insecureTls);
    } else {
      return;
    }
    setConnStatus(result !== null ? { state: "ok", version: result } : { state: "err" });
  };
  // Save-then-test needs a saveable form (name + host); a typed key is only required when
  // adding — in edit mode a blank key field reuses the stored secret. Falls back to the
  // bare onTestConnection probe only when the save-and-test handlers aren't provided.
  // Secret-field descriptor for the current service type (edit → id, add → typed name).
  // Drives the field's label/hint/placeholder and the colon-pair format validation below.
  const sec = matchPreset(editing ? (service?.id ?? "") : f.name)?.secret;
  // A "userpass" service expects a colon-separated pair in the key field; flag a typed value
  // that's missing the ":" so we can warn inline and block a doomed connection test.
  const secretMalformed = sec?.kind === "userpass" && f.apiKey.trim() !== "" && !f.apiKey.includes(":");

  const canTest =
    !secretMalformed &&
    ((Boolean(onSaveAndTest) && Boolean(onTestSaved) && f.name.trim() !== "" && f.host.trim() !== "" && (editing || f.apiKey.trim() !== "")) ||
    (!(onSaveAndTest && onTestSaved) && Boolean(onTestConnection)));

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
      icon={f.logoSlug ? undefined : (isIcon(f.icon) ? f.icon : "dns")}
      logoSlug={f.logoSlug || undefined}
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
            <ToggleRow
              on={f.active}
              onChange={(v) => set("active", v)}
              color="var(--originator-own)"
              icon={f.active ? "check_circle" : "do_not_disturb_on"}
              title="Service is active"
              desc={f.active
                ? "Live on the portal — visible to its groups and polled for status."
                : "Disabled — hidden from everyone and not polled. Config & key are kept."}
            />
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
            <Field label="API base URL" hint="internal — defaults to the public host">
              <div style={{ display: "flex", gap: 7 }}>
                <select className="input" value={f.internalScheme} onChange={(e) => set("internalScheme", e.target.value as "https" | "http")} style={{ ...fieldInput, fontFamily: "var(--font-mono)", width: "auto", flexShrink: 0 }}>
                  <option value="https">https://</option>
                  <option value="http">http://</option>
                </select>
                <input
                  className="input"
                  style={{ ...fieldInput, fontFamily: "var(--font-mono)", flex: 1, minWidth: 0 }}
                  value={f.internalUrl}
                  onChange={(e) => set("internalUrl", e.target.value)}
                  placeholder="e.g. 192.168.1.50:8181 — leave blank to use the host above"
                />
              </div>
            </Field>
            <ToggleRow
              on={f.insecureTls}
              onChange={(v) => set("insecureTls", v)}
              color="var(--warning, #d08770)"
              icon={f.insecureTls ? "gpp_maybe" : "verified_user"}
              title="Allow self-signed TLS"
              desc={f.insecureTls ? "Insecure — skips cert verification. Use only for trusted LAN hosts (e.g. Unraid)." : "Cert verification stays on. Enable only if this host serves a self-signed certificate."}
            />
            <Field label="Internal note" hint="shown to admins only">
              <input className="input" style={fieldInput} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="What is this service for?" />
            </Field>
            {lokiConfigured && (
              <Field label="Loki query" hint="optional — log selector for the admin Logs viewer">
                <input
                  className="input"
                  style={{ ...fieldInput, fontFamily: "var(--font-mono)" }}
                  value={f.lokiQuery}
                  onChange={(e) => set("lokiQuery", e.target.value)}
                  placeholder={`{container="${(editing ? service?.id : f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "service"}"}`}
                />
              </Field>
            )}
            {portainerConfigured && (
              <div style={{ display: "grid", gridTemplateColumns: "60% 40%", gap: 12 }}>
                <Field label="Container name" hint="optional — enables the admin restart control">
                  <input
                    className="input"
                    style={{ ...fieldInput, fontFamily: "var(--font-mono)" }}
                    value={f.containerName}
                    onChange={(e) => set("containerName", e.target.value)}
                    placeholder="e.g. jellyfin"
                  />
                </Field>
                <Field label="Endpoint id" hint="Portainer env">
                  <input
                    className="input"
                    style={{ ...fieldInput, fontFamily: "var(--font-mono)" }}
                    value={f.portainerEndpointId}
                    onChange={(e) => set("portainerEndpointId", e.target.value)}
                    placeholder="auto"
                  />
                </Field>
              </div>
            )}
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
            {f.embeddable && (
              <ToggleRow
                on={f.keepAlive}
                onChange={(v) => set("keepAlive", v)}
                color="var(--primary)"
                icon="cached"
                title="Keep session alive"
                desc="Keep the iframe mounted after first open so switching between services preserves its state (it keeps running in the background)."
              />
            )}
            <Field
              label={sec?.label ?? "API key"}
              hint={editing ? (sec?.kind === "userpass" ? "leave blank to keep current credentials" : "leave blank to keep current key") : (sec?.hint ?? "encrypted at rest")}
            >
              <div style={{ display: "flex", gap: 7 }}>
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  <Icon name="key" size={15} color="var(--originator-own)" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    className="input"
                    type={revealKey ? "text" : "password"}
                    style={{ ...fieldInput, paddingLeft: 34, fontFamily: "var(--font-mono)" }}
                    value={f.apiKey}
                    onChange={(e) => set("apiKey", e.target.value)}
                    placeholder={editing ? "•••••••• (unchanged)" : (sec?.placeholder ?? "paste service API key")}
                  />
                </div>
                <button type="button" onClick={() => setRevealKey((r) => !r)} className="btn btn-secondary btn-sm" style={{ padding: "0 11px" }} title={revealKey ? "Hide" : "Reveal"}>
                  <Icon name={revealKey ? "visibility_off" : "visibility"} size={16} />
                </button>
                <button type="button" onClick={handleTest} disabled={!canTest || connStatus.state === "testing"} className="btn btn-secondary btn-sm" style={{ padding: "0 11px" }} title="Save and test connection">
                  {connStatus.state === "testing" ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>…</span> : <Icon name="wifi_find" size={16} />}
                </button>
              </div>
              {secretMalformed && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--warning)" }}>
                  <Icon name="warning" size={13} />
                  <span>Expected {sec?.placeholder ?? "user:password"} — include the “:” separator</span>
                </div>
              )}
              {connStatus.state !== "idle" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {connStatus.state === "testing" && <span style={{ color: "var(--on-surface-variant)" }}>Saving & testing…</span>}
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
                      <span style={{ color: "var(--on-surface-variant)" }}>
                        {sec?.kind === "userpass"
                          ? `Could not connect — check host and the ${sec.placeholder ?? "user:password"} format`
                          : "Could not connect — check host and API key"}
                      </span>
                    </>
                  )}
                </div>
              )}
            </Field>

            {/* FORWARD-AUTH (authentik) — authenticate THROUGH a reverse-proxy outpost.
                Separate from the API key above, so a service can carry both. */}
            <Field
              label="Forward-auth"
              hint={service?.forwardAuthConfig ? "authentik outpost — edit fields and save (password kept unless re-entered)" : editing ? "authentik outpost — leave method unset to keep current" : "authentik outpost — optional"}
            >
              <select
                className="input"
                style={{ ...fieldInput, fontFamily: "var(--font-mono)" }}
                value={f.forwardAuthMethod}
                onChange={(e) => set("forwardAuthMethod", e.target.value as ServiceForm["forwardAuthMethod"])}
              >
                <option value="">{service?.forwardAuthConfig ? "Leave unchanged" : "Not behind forward-auth"}</option>
                <option value="bearer">Bearer JWT (client-credentials)</option>
                <option value="basic">HTTP Basic (service account)</option>
                {editing && <option value="remove">Remove forward-auth</option>}
              </select>
            </Field>
            {(f.forwardAuthMethod === "basic" || f.forwardAuthMethod === "bearer") && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 11, borderLeft: "2px solid var(--outline-variant)" }}>
                {f.forwardAuthMethod === "bearer" && (
                  <>
                    <Field label="Token URL" hint="authentik OAuth2 token endpoint">
                      <input className="input" style={{ ...fieldInput, fontFamily: "var(--font-mono)" }} value={f.forwardAuthTokenUrl} onChange={(e) => set("forwardAuthTokenUrl", e.target.value)} placeholder="https://authentik.example.com/application/o/token/" />
                    </Field>
                    <Field label="Client ID" hint="the proxy provider's client_id">
                      <input className="input" style={{ ...fieldInput, fontFamily: "var(--font-mono)" }} value={f.forwardAuthClientId} onChange={(e) => set("forwardAuthClientId", e.target.value)} placeholder="proxy provider client_id" />
                    </Field>
                  </>
                )}
                <Field label="Service account">
                  <input className="input" style={{ ...fieldInput, fontFamily: "var(--font-mono)" }} value={f.forwardAuthUsername} onChange={(e) => set("forwardAuthUsername", e.target.value)} placeholder="service-account username" />
                </Field>
                <Field label="App password" hint={editing ? "leave blank to keep current" : "encrypted at rest"}>
                  <input className="input" type={revealKey ? "text" : "password"} style={{ ...fieldInput, fontFamily: "var(--font-mono)" }} value={f.forwardAuthPassword} onChange={(e) => set("forwardAuthPassword", e.target.value)} placeholder={editing ? "•••••••• (unchanged)" : "app password"} />
                </Field>
                {f.forwardAuthMethod === "bearer" && (
                  <Field label="Scope" hint="optional — defaults to openid">
                    <input className="input" style={{ ...fieldInput, fontFamily: "var(--font-mono)" }} value={f.forwardAuthScope} onChange={(e) => set("forwardAuthScope", e.target.value)} placeholder="openid" />
                  </Field>
                )}
              </div>
            )}
          </div>
        </section>

        <Divider />

        {/* MONITORING SOURCE (Gatus owns probing — live heartbeat shown when editing) */}
        <section>
          <SectionLabel hint={editing && service ? `${service.uptime.toFixed(2)}% · last probe ${service.ms}ms` : "which Gatus endpoint tracks this service"}>Monitoring source</SectionLabel>
          <MonitoringKeyPicker value={f.monitoringKey} onChange={(v) => set("monitoringKey", v)} />
          {editing && service && service.beats && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)" }}>
              <Heartbeat beats={service.beats.slice(-22)} h={18} barW={3} />
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
                <StatusDot status={service.status} size={7} />
                {service.status === "unknown" ? "no data" : `${service.uptime.toFixed(2)}% · ${service.status}`}
              </span>
            </div>
          )}
        </section>

        <Divider />

        {/* SPOTLIGHT */}
        <section>
          <SectionLabel>Central-services spotlight</SectionLabel>
          <ToggleRow on={f.central} onChange={(v) => set("central", v)} color="var(--primary)" icon="bolt" title="Feature on the dashboard spotlight" desc="Pin this service to the top-of-portal quick-launch row." />
          {editing && service && (
            <ToggleRow
              on={favorites.includes(service.id)}
              onChange={() => toggleFavorite(service.id)}
              color="var(--amber)"
              icon="star"
              title="Pin to rail"
              desc="Show as a quick-launch icon in your side rail."
            />
          )}
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
                    <Toggle on={vis[g.name] ?? false} onChange={(v) => { visTouched.current = true; setVis((p) => ({ ...p, [g.name]: v })); }} size="sm" color="var(--originator-court)" />
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
