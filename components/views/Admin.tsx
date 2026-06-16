"use client";
// ============================================================
// AERIE — Admin area (services · members · visibility)
// ============================================================
import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Service } from "@/lib/types";
import { useData, useRefresh, usePatchData } from "@/components/portal/DataProvider";
import { setVisibility, upsertService, setServiceSecret, mergeServiceForwardAuth, clearServiceForwardAuth, deleteService, serviceExists, detectServiceVersion, probeServiceVersion, testStoredConnection } from "@/app/(portal)/admin/actions";
import { Icon } from "@/components/primitives";
import { PageHeader } from "@/components/views/shared";
import { ServiceModal, type ServiceForm } from "@/components/modals/ServiceModal";
import { Toast } from "@/components/modals/Toast";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { AdminServices } from "@/components/views/admin/AdminServices";
import { AdminMembers } from "@/components/views/admin/AdminMembers";
import { AdminVisibility } from "@/components/views/admin/AdminVisibility";
import { AdminPlex } from "@/components/views/admin/AdminPlex";

// Optimistic (non-secret) forward-auth config for the local snapshot after a save, mirroring what
// the server stores. "remove" clears it; an unset method keeps the prior value (server keeps it too).
function optimisticForwardAuth(form: ServiceForm, prior: Service["forwardAuthConfig"]): Service["forwardAuthConfig"] {
  if (form.forwardAuthMethod === "remove") return undefined;
  if (form.forwardAuthMethod === "bearer")
    return { method: "bearer", username: form.forwardAuthUsername.trim(), tokenUrl: form.forwardAuthTokenUrl.trim() || undefined, clientId: form.forwardAuthClientId.trim() || undefined, scope: form.forwardAuthScope.trim() || undefined };
  if (form.forwardAuthMethod === "basic") return { method: "basic", username: form.forwardAuthUsername.trim() };
  return prior;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const isIconName = (s: string) => /^[a-z_]+$/.test(s);

export function Admin() {
  const router = useRouter();
  const { groups, visibility, adminGroup, lokiConfigured = false, allServices } = useData();
  const refresh = useRefresh();
  const patchData = usePatchData();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("services");
  const [svcModal, setSvcModal] = useState<{ mode: "add" | "edit"; service?: Service; prefill?: Partial<ServiceForm> } | null>(null);
  // The id auto-saved by "Test connection" in add mode — lets a subsequent save/test of the
  // same id reconcile idempotently instead of tripping the duplicate-id guard.
  const lastAutoSavedId = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The Plex Maintenance tab only appears once a Plex token is stored (maintenance actions need it).
  const plexConfigured = allServices.some((s) => s.id === "plex" && s.hasSecret);
  const tabs: [string, string, string, string][] = [
    ["services", "Services & Secrets", "Services", "dns"],
    ["members", "Members", "Members", "group"],
    ["visibility", "Visibility", "Visibility", "visibility"],
    ...(plexConfigured ? ([["plex", "Plex Maintenance", "Plex", "smart_display"]] as [string, string, string, string][]) : []),
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
    // Rejoin the two-input API base URL into the stored full-URL form (null when blank).
    const internalRest = form.internalUrl.trim();
    const internalUrl = internalRest ? `${form.internalScheme}://${internalRest}` : null;
    await upsertService({
      id,
      name: form.name.trim(),
      cat: form.cat,
      icon: isIconName(form.icon) ? form.icon : "dns",
      logoSlug: form.logoSlug || null,
      host: form.host.trim(),
      baseUrl: `${form.scheme}://${form.host.trim()}`,
      internalUrl,
      embeddable: form.embeddable,
      keepAlive: form.keepAlive,
      active: form.active,
      central: form.central,
      centralLabel: form.central ? form.centralLabel || null : null,
      version: form.version || null,
      note: form.note || null,
      monitoringKey: form.monitoringKey || null,
      lokiQuery: form.lokiQuery || null,
      insecureTls: form.insecureTls,
    });
    // Only write the secret when the admin actually entered one (blank = keep).
    if (form.apiKey && form.apiKey.trim()) await setServiceSecret(id, form.apiKey.trim());
    // Forward-auth (authentik) — a separate `forwardAuth`-kind secret, so it coexists with
    // the API key. "remove" clears it; a basic/bearer method writes it (the server preserves the
    // stored password when the password field is left blank, so non-secret edits don't need it);
    // an unset method leaves the current config untouched.
    try {
      if (form.forwardAuthMethod === "remove") {
        await clearServiceForwardAuth(id);
      } else if (form.forwardAuthMethod) {
        const cfg =
          form.forwardAuthMethod === "bearer"
            ? { method: "bearer" as const, tokenUrl: form.forwardAuthTokenUrl.trim(), clientId: form.forwardAuthClientId.trim(), username: form.forwardAuthUsername.trim(), password: form.forwardAuthPassword, scope: form.forwardAuthScope.trim() || undefined }
            : { method: "basic" as const, username: form.forwardAuthUsername.trim(), password: form.forwardAuthPassword };
        await mergeServiceForwardAuth(id, cfg);
      }
    } catch {
      return { error: "Invalid forward-auth config — check the token URL, client id and account fields" };
    }
    // Visibility after the service row exists (FK); admin group is always on.
    for (const g of groups) await setVisibility(id, g.name, g.name === adminGroup ? true : Boolean(vis[g.name]));

    // Optimistically update the local snapshot so the service appears immediately.
    const optimisticService: Service = editing
      ? { ...svcModal!.service!, name: form.name.trim(), cat: form.cat as Service["cat"], icon: isIconName(form.icon) ? form.icon : "dns", logoSlug: form.logoSlug || undefined, host: form.host.trim(), scheme: form.scheme, internalUrl: internalUrl ?? undefined, insecureTls: form.insecureTls, embeddable: form.embeddable, keepAlive: form.keepAlive, active: form.active, central: form.central, centralLabel: form.central ? form.centralLabel || undefined : undefined, version: form.version || svcModal!.service!.version, note: form.note || "", monitoringKey: form.monitoringKey || undefined, lokiQuery: form.lokiQuery || undefined, forwardAuthConfig: optimisticForwardAuth(form, svcModal!.service!.forwardAuthConfig) }
      : { id, name: form.name.trim(), cat: form.cat as Service["cat"], icon: isIconName(form.icon) ? form.icon : "dns", logoSlug: form.logoSlug || undefined, host: form.host.trim(), scheme: form.scheme, internalUrl: internalUrl ?? undefined, insecureTls: form.insecureTls, embeddable: form.embeddable, keepAlive: form.keepAlive, active: form.active, central: form.central, centralLabel: form.central ? form.centralLabel || undefined : undefined, version: form.version || "", note: form.note || "", monitoringKey: form.monitoringKey || undefined, lokiQuery: form.lokiQuery || undefined, status: "unknown", uptime: 0, ms: 0, beats: [] };
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
      <div style={{ display: "flex", gap: 4, padding: `12px ${isMobile ? 16 : 32}px 0`, borderBottom: "1px solid var(--outline-variant)", flexShrink: 0 }}>
        {tabs.map(([id, desktopLabel, mobileLabel, icon]) => (
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
            {isMobile ? mobileLabel : desktopLabel}
          </button>
        ))}
      </div>
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="aerie-page-pad aerie-page-pad--readable">
          {tab === "services" && <AdminServices isMobile={isMobile} onOpenService={openService} onEdit={(s) => setSvcModal({ mode: "edit", service: s })} onAddDiscovered={(prefill) => { lastAutoSavedId.current = null; setSvcModal({ mode: "add", prefill }); }} />}
          {tab === "members" && <AdminMembers isMobile={isMobile} />}
          {tab === "visibility" && <AdminVisibility isMobile={isMobile} />}
          {tab === "plex" && <AdminPlex isMobile={isMobile} flash={flash} />}
        </div>
      </div>

      {svcModal && (
        <ServiceModal
          open
          mode={svcModal.mode}
          service={svcModal.service}
          prefill={svcModal.prefill}
          lokiConfigured={lokiConfigured}
          groups={groups}
          adminGroup={adminGroup}
          initialVisibility={svcModal.mode === "edit" && svcModal.service ? visForService(svcModal.service.id) : addDefaults()}
          onClose={() => { lastAutoSavedId.current = null; setSvcModal(null); }}
          onSave={onSave}
          onDelete={onDelete}
          onDetectVersion={async (baseUrl, apiKey, name, insecureTls) => {
            if (svcModal.mode === "edit" && svcModal.service && !apiKey) {
              const v = await detectServiceVersion(svcModal.service.id);
              if (v) refresh();
              return v;
            }
            return probeServiceVersion(baseUrl, apiKey, slug(name), insecureTls);
          }}
          onTestConnection={async (baseUrl, apiKey, name, insecureTls) => {
            if (svcModal.mode === "edit" && svcModal.service && !apiKey) {
              return testStoredConnection(svcModal.service.id);
            }
            return probeServiceVersion(baseUrl, apiKey, slug(name), insecureTls);
          }}
          onSaveAndTest={onSaveAndTest}
          onTestSaved={(id) => testStoredConnection(id)}
        />
      )}
      <Toast message={toast} />
    </section>
  );
}
