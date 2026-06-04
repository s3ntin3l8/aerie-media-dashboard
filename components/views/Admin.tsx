"use client";
// ============================================================
// AERIE — Admin area (services · members · visibility)
// ============================================================
import React, { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Service, OverseerrQuota } from "@/lib/types";
import { useData, useRefresh, usePatchData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { setVisibility, upsertService, setServiceSecret, deleteService, serviceExists, detectServiceVersion, probeServiceVersion, testStoredConnection, setUserOverseerrQuota } from "@/app/(portal)/admin/actions";
import { Icon, Eyebrow, Pill, Chip, Avatar, Divider, ProgressBar, CatBadge } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { PageHeader } from "@/components/views/shared";
import { ServiceModal, type ServiceForm } from "@/components/modals/ServiceModal";
import { Toast } from "@/components/modals/Toast";

function AdminServices({ onOpenService, onEdit }: { onOpenService: (s: Service) => void; onEdit: (s: Service) => void }) {
  const { services } = useData();
  const { favorites, toggleFavorite } = usePortal();
  const cols = "1.6fr 1fr 0.7fr 1.2fr 0.5fr";
  return (
    <div className="aerie-x-scroll">
      <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "11px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
          {["Service", "Host", "Embed", "API key", ""].map((h, i) => (
            <Eyebrow key={i}>{h}</Eyebrow>
          ))}
        </div>
        {services.map((s, i) => {
          const pinned = favorites.includes(s.id);
          return (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: "12px 18px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <ServiceLogo service={s} size={28} radius={7} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--on-surface)" }}>{s.name}</div>
                  <div style={{ fontSize: 10 }}>
                    <CatBadge cat={s.cat} size="xs" />
                  </div>
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.host}</span>
              <span>{s.embeddable ? <Icon name="check" size={16} color="var(--originator-own)" /> : <Icon name="open_in_new" size={15} color="var(--on-surface-variant)" />}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
                <Icon name="lock" size={12} color="var(--originator-own)" />
                ••••••••<span style={{ fontSize: 9, opacity: 0.7 }}>AES-GCM</span>
              </span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                <button onClick={() => toggleFavorite(s.id)} className="btn btn-ghost btn-sm" style={{ padding: 6, color: pinned ? "var(--amber)" : undefined }} title={pinned ? "Unpin from rail" : "Pin to rail"}>
                  <Icon name={pinned ? "star" : "star_border"} size={15} />
                </button>
                <button onClick={() => onOpenService(s)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="Open">
                  <Icon name="open_in_full" size={15} />
                </button>
                <button onClick={() => onEdit(s)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="Edit">
                  <Icon name="edit" size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuotaEditor({ userId, linked, movieQuota, tvQuota }: { userId: string; linked: boolean; movieQuota: OverseerrQuota | null; tvQuota: OverseerrQuota | null }) {
  const refresh = useRefresh();
  const [pending, start] = useTransition();

  const [movieUnlim, setMovieUnlim] = useState(movieQuota?.limit == null);
  const [movieLimit, setMovieLimit] = useState(String(movieQuota?.limit ?? 10));
  const [movieDays, setMovieDays] = useState(String(movieQuota?.days ?? 7));
  const [tvUnlim, setTvUnlim] = useState(tvQuota?.limit == null);
  const [tvLimit, setTvLimit] = useState(String(tvQuota?.limit ?? 10));
  const [tvDays, setTvDays] = useState(String(tvQuota?.days ?? 7));

  useEffect(() => {
    setMovieUnlim(movieQuota?.limit == null);
    setMovieLimit(String(movieQuota?.limit ?? 10));
    setMovieDays(String(movieQuota?.days ?? 7));
    setTvUnlim(tvQuota?.limit == null);
    setTvLimit(String(tvQuota?.limit ?? 10));
    setTvDays(String(tvQuota?.days ?? 7));
  }, [movieQuota?.limit, movieQuota?.days, tvQuota?.limit, tvQuota?.days]);

  const save = (overrides: { mu?: boolean; tu?: boolean } = {}) => {
    const mu = overrides.mu !== undefined ? overrides.mu : movieUnlim;
    const tu = overrides.tu !== undefined ? overrides.tu : tvUnlim;
    start(async () => {
      await setUserOverseerrQuota(userId, {
        movieQuotaLimit: mu ? null : Math.max(1, Math.floor(Number(movieLimit) || 1)),
        movieQuotaDays: Math.max(1, Math.floor(Number(movieDays) || 7)),
        tvQuotaLimit: tu ? null : Math.max(1, Math.floor(Number(tvLimit) || 1)),
        tvQuotaDays: Math.max(1, Math.floor(Number(tvDays) || 7)),
      });
      refresh();
    });
  };

  const inpStyle: React.CSSProperties = { width: 36, padding: "2px 4px", borderRadius: 6, border: "1px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--on-surface)", fontFamily: "var(--font-mono)", fontSize: 11, textAlign: "center" };
  const disabled = !linked || pending;

  const row = (
    label: string, icon: string,
    quota: OverseerrQuota | null,
    unlim: boolean, onUnlim: (v: boolean) => void,
    limit: string, onLimit: (v: string) => void,
    days: string, onDays: (v: string) => void,
    onToggleSave: (v: boolean) => void,
  ) => {
    const used = quota?.used ?? 0;
    const lim = quota?.limit ?? null;
    const pct = lim ? Math.min(100, (used / lim) * 100) : 0;
    const atLimit = quota?.restricted ?? false;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: linked ? 1 : 0.45 }}>
        <Icon name={icon} size={12} color="var(--on-surface-variant)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", width: 32, flexShrink: 0 }}>{label}</span>
        {linked && !unlim && <div style={{ width: 48, flexShrink: 0 }}><ProgressBar pct={pct} color={atLimit ? "var(--amber)" : "var(--originator-court)"} h={4} /></div>}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: atLimit ? "var(--amber)" : "var(--on-surface-variant)", flexShrink: 0 }}>{used}/{lim ?? "∞"}</span>
        <span style={{ flex: 1 }} />
        {linked && (
          <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer", userSelect: "none", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
              <input type="checkbox" checked={unlim} disabled={pending} onChange={(e) => { onUnlim(e.target.checked); onToggleSave(e.target.checked); }} style={{ width: 12, height: 12, accentColor: "var(--primary)" }} />
              ∞
            </label>
            {!unlim && (
              <>
                <input type="number" min={1} value={limit} disabled={disabled} onChange={(e) => onLimit(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota limit`} style={inpStyle} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>/</span>
                <input type="number" min={1} value={days} disabled={disabled} onChange={(e) => onDays(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota days`} style={{ ...inpStyle, width: 30 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>d</span>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Eyebrow>Requests</Eyebrow>
        {!linked && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--amber)" }}>no Overseerr account</span>}
      </div>
      {row("Movies", "movie", movieQuota, movieUnlim, setMovieUnlim, movieLimit, setMovieLimit, movieDays, setMovieDays, (v) => save({ mu: v }))}
      {row("TV", "live_tv", tvQuota, tvUnlim, setTvUnlim, tvLimit, setTvLimit, tvDays, setTvDays, (v) => save({ tu: v }))}
    </div>
  );
}

function AdminMembers() {
  const { users } = useData();
  const { user } = usePortal();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
      {users.map((u) => (
        <div key={u.id} style={{ padding: 15, borderRadius: 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Avatar name={u.name} size={38} color={u.role === "admin" ? "var(--primary)" : "var(--originator-court)"} you={u.id === user.id} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 14, color: "var(--on-surface)" }}>{u.name}</span>
                {u.role === "admin" && <Pill tone="primary">Admin</Pill>}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{u.email}</div>
            </div>
          </div>
          <Divider style={{ margin: "13px 0 11px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {u.groups.map((g) => (
              <Chip key={g} icon="group">
                {g}
              </Chip>
            ))}
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11, color: u.linked ? "var(--originator-own)" : "var(--amber)" }}>
              <Icon name={u.linked ? "link" : "link_off"} size={13} />
              {u.linked ? "linked" : "unlinked"}
            </span>
          </div>
          <QuotaEditor userId={u.id} linked={u.linked} movieQuota={u.movieQuota} tvQuota={u.tvQuota} />
        </div>
      ))}
    </div>
  );
}

function AdminVisibility() {
  const { services, groups, visibility } = useData();
  const [, startTransition] = useTransition();
  // Optimistic local state keyed by `${serviceId}:${groupName}`.
  const [state, setState] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const v of visibility) m[`${v.serviceId}:${v.groupName}`] = v.visible;
    return m;
  });
  const cols = `1.4fr repeat(${groups.length}, 1fr)`;

  const toggle = (serviceId: string, groupName: string) => {
    const key = `${serviceId}:${groupName}`;
    const next = !state[key];
    setState((s) => ({ ...s, [key]: next }));
    startTransition(async () => {
      try {
        await setVisibility(serviceId, groupName, next);
      } catch {
        setState((s) => ({ ...s, [key]: !next })); // revert on failure
      }
    });
  };

  return (
    <div className="aerie-x-scroll">
      <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "12px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
          <Eyebrow>Service → Group</Eyebrow>
          {groups.map((g) => (
            <div key={g.name} style={{ textAlign: "center" }}>
              <Chip icon="group">{g.name}</Chip>
            </div>
          ))}
        </div>
        {services.map((s, i) => (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "10px 18px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <ServiceLogo service={s} size={20} radius={5} />
              <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--on-surface)" }}>{s.name}</span>
            </div>
            {groups.map((g) => {
              const on = state[`${s.id}:${g.name}`] ?? false;
              return (
                <div key={g.name} style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => toggle(s.id, g.name)}
                    aria-label={`${s.name} visible to ${g.name}`}
                    style={{
                      width: 30,
                      height: 18,
                      borderRadius: 9999,
                      position: "relative",
                      border: "none",
                      padding: 0,
                      background: on ? "color-mix(in srgb, var(--originator-own) 30%, transparent)" : "color-mix(in srgb, var(--on-surface-variant) 18%, transparent)",
                      cursor: "pointer",
                      transition: "background .15s",
                    }}
                  >
                    <span style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: 9999, background: on ? "var(--originator-own)" : "var(--on-surface-variant)", transition: "left .15s" }} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const isIconName = (s: string) => /^[a-z_]+$/.test(s);

export function Admin() {
  const router = useRouter();
  const { groups, visibility, adminGroup } = useData();
  const refresh = useRefresh();
  const patchData = usePatchData();
  const [tab, setTab] = useState("services");
  const [svcModal, setSvcModal] = useState<{ mode: "add" | "edit"; service?: Service } | null>(null);
  // The id auto-saved by "Test connection" in add mode — lets a subsequent save/test of the
  // same id reconcile idempotently instead of tripping the duplicate-id guard.
  const lastAutoSavedId = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const tabs: [string, string, string][] = [
    ["services", "Services & Secrets", "dns"],
    ["members", "Members", "group"],
    ["visibility", "Visibility", "visibility"],
  ];
  const openService = (s: Service) => router.push(`/s/${s.id}`);
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // Build the per-group visibility map the modal seeds from.
  const visForService = (id: string) => {
    const m: Record<string, boolean> = {};
    for (const g of groups) m[g.name] = false;
    for (const v of visibility) if (v.serviceId === id) m[v.groupName] = v.visible;
    m[adminGroup] = true;
    return m;
  };
  const addDefaults = () => {
    const m: Record<string, boolean> = {};
    for (const g of groups) m[g.name] = g.name !== "guests";
    m[adminGroup] = true;
    return m;
  };

  // Persist a service (config + secret + visibility) and patch the local snapshot,
  // WITHOUT closing the modal. Shared by the Save button and the auto-save-on-Test flow.
  // Returns the saved id + optimistic Service, or an error message to flash.
  const persistService = async (
    form: ServiceForm,
    vis: Record<string, boolean>,
  ): Promise<{ id: string; service: Service } | { error: string }> => {
    const editing = svcModal?.mode === "edit";
    const id = editing ? svcModal!.service!.id : slug(form.name);
    if (!id) return { error: "Enter a service name first" };
    // In add mode, reject a duplicate id — UNLESS it's the one we just auto-saved for a test
    // (re-saving / re-testing the same nascent service is an idempotent update, not a clash).
    if (!editing && id !== lastAutoSavedId.current && (await serviceExists(id))) {
      return { error: `A service id "${id}" already exists` };
    }
    await upsertService({
      id,
      name: form.name.trim(),
      cat: form.cat,
      icon: isIconName(form.icon) ? form.icon : "dns",
      logoSlug: form.logoSlug || null,
      host: form.host.trim(),
      baseUrl: `${form.scheme}://${form.host.trim()}`,
      internalUrl: form.internalUrl.trim() || null,
      embeddable: form.embeddable,
      central: form.central,
      centralLabel: form.central ? form.centralLabel || null : null,
      version: form.version || null,
      note: form.note || null,
      monitoringKey: form.monitoringKey || null,
    });
    // Only write the secret when the admin actually entered one (blank = keep).
    if (form.apiKey && form.apiKey.trim()) await setServiceSecret(id, form.apiKey.trim());
    // Visibility after the service row exists (FK); admin group is always on.
    for (const g of groups) await setVisibility(id, g.name, g.name === adminGroup ? true : Boolean(vis[g.name]));

    // Optimistically update the local snapshot so the service appears immediately.
    const optimisticService: Service = editing
      ? { ...svcModal!.service!, name: form.name.trim(), cat: form.cat as Service["cat"], icon: isIconName(form.icon) ? form.icon : "dns", logoSlug: form.logoSlug || undefined, host: form.host.trim(), scheme: form.scheme, internalUrl: form.internalUrl.trim() || undefined, embeddable: form.embeddable, central: form.central, centralLabel: form.central ? form.centralLabel || undefined : undefined, version: form.version || svcModal!.service!.version, note: form.note || "", monitoringKey: form.monitoringKey || undefined }
      : { id, name: form.name.trim(), cat: form.cat as Service["cat"], icon: isIconName(form.icon) ? form.icon : "dns", logoSlug: form.logoSlug || undefined, host: form.host.trim(), scheme: form.scheme, internalUrl: form.internalUrl.trim() || undefined, embeddable: form.embeddable, central: form.central, centralLabel: form.central ? form.centralLabel || undefined : undefined, version: form.version || "", note: form.note || "", monitoringKey: form.monitoringKey || undefined, status: "unknown", uptime: 0, ms: 0, beats: [] };
    // Dedupe by id: in add mode the service may already be in the snapshot from a prior
    // auto-save-on-Test, so replace rather than append (avoids a duplicate React key).
    patchData((s) => ({
      ...s,
      services: s.services.some((svc) => svc.id === id)
        ? s.services.map((svc) => (svc.id === id ? optimisticService : svc))
        : [...s.services, optimisticService],
    }));
    return { id, service: optimisticService };
  };

  // Auto-save on "Test connection" (add mode): persist config + secret without closing the
  // modal (it stays in add mode, so no remount/state reset), then the modal tests the *stored*
  // connection by id. Remember the id so the duplicate-id guard treats re-saves as updates.
  const onSaveAndTest = async (form: ServiceForm, vis: Record<string, boolean>): Promise<string | null> => {
    const wasEditing = svcModal?.mode === "edit";
    const res = await persistService(form, vis);
    if ("error" in res) { flash(res.error); return null; }
    if (!wasEditing) {
      lastAutoSavedId.current = res.id;
      flash(`${form.name.trim()} saved — testing connection…`);
    }
    refresh();
    return res.id;
  };

  const onSave = async (form: ServiceForm, vis: Record<string, boolean>) => {
    const editing = svcModal?.mode === "edit";
    const res = await persistService(form, vis);
    if ("error" in res) { flash(res.error); return; }
    const { id } = res;

    setSvcModal(null);
    refresh();
    // Auto-detect version when none was manually entered and a key is available.
    if (!form.version && (form.apiKey.trim() || editing)) {
      const detected = await detectServiceVersion(id);
      if (detected) {
        refresh();
        flash(editing ? `Saved — v${detected} detected` : `${form.name} added — v${detected} detected`);
        return;
      }
    }
    flash(editing ? `Saved changes to ${form.name}` : `${form.name} added to the portal`);
  };

  const onDelete = async (s: Service) => {
    await deleteService(s.id);
    setSvcModal(null);
    refresh();
    flash(`${s.name} removed`);
  };

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <PageHeader eyebrow="Lead operator" title="Admin" icon="tune" accent="var(--primary)" sub="Manage services, members and what each group can see.">
        <button onClick={() => { lastAutoSavedId.current = null; setSvcModal({ mode: "add" }); }} className="btn btn-primary btn-sm">
          <Icon name="add" size={15} /> Add service
        </button>
      </PageHeader>
      <div style={{ display: "flex", gap: 4, padding: "12px 32px 0", borderBottom: "1px solid var(--outline-variant)", flexShrink: 0 }}>
        {tabs.map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 14px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 12.5,
              fontWeight: 600,
              color: tab === id ? "var(--primary)" : "var(--on-surface-variant)",
              borderBottom: "2px solid " + (tab === id ? "var(--primary)" : "transparent"),
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}
          >
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="aerie-page-pad" style={{ maxWidth: 1080, margin: "0 auto" }}>
          {tab === "services" && <AdminServices onOpenService={openService} onEdit={(s) => setSvcModal({ mode: "edit", service: s })} />}
          {tab === "members" && <AdminMembers />}
          {tab === "visibility" && <AdminVisibility />}
        </div>
      </div>

      {svcModal && (
        <ServiceModal
          open
          mode={svcModal.mode}
          service={svcModal.service}
          groups={groups}
          adminGroup={adminGroup}
          initialVisibility={svcModal.mode === "edit" && svcModal.service ? visForService(svcModal.service.id) : addDefaults()}
          onClose={() => { lastAutoSavedId.current = null; setSvcModal(null); }}
          onSave={onSave}
          onDelete={onDelete}
          onDetectVersion={async (baseUrl, apiKey, name) => {
            if (svcModal.mode === "edit" && svcModal.service && !apiKey) {
              const v = await detectServiceVersion(svcModal.service.id);
              if (v) refresh();
              return v;
            }
            return probeServiceVersion(baseUrl, apiKey, slug(name));
          }}
          onTestConnection={async (baseUrl, apiKey, name) => {
            if (svcModal.mode === "edit" && svcModal.service && !apiKey) {
              return testStoredConnection(svcModal.service.id);
            }
            return probeServiceVersion(baseUrl, apiKey, slug(name));
          }}
          onSaveAndTest={onSaveAndTest}
          onTestSaved={(id) => testStoredConnection(id)}
        />
      )}
      <Toast message={toast} />
    </section>
  );
}
