"use client";
// ============================================================
// AERIE — Admin area (services · members · visibility)
// ============================================================
import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Service } from "@/lib/types";
import { catColor } from "@/lib/categories";
import { useData, useRefresh } from "@/components/portal/DataProvider";
import { setVisibility, upsertService, setServiceSecret, deleteService, serviceExists } from "@/app/(portal)/admin/actions";
import { Icon, Eyebrow, Pill, Chip, Avatar, Divider, ProgressBar, CatBadge } from "@/components/primitives";
import { PageHeader } from "@/components/views/shared";
import { ServiceModal, type ServiceForm } from "@/components/modals/ServiceModal";
import { Toast } from "@/components/modals/Toast";

function AdminServices({ onOpenService, onEdit }: { onOpenService: (s: Service) => void; onEdit: (s: Service) => void }) {
  const { services } = useData();
  const cols = "1.6fr 1fr 0.7fr 1.2fr 0.5fr";
  return (
    <div className="aerie-x-scroll">
      <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "11px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
          {["Service", "Host", "Embed", "API key", ""].map((h, i) => (
            <Eyebrow key={i}>{h}</Eyebrow>
          ))}
        </div>
        {services.map((s, i) => (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: "12px 18px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${catColor(s.cat)} 13%, transparent)`, flexShrink: 0 }}>
                <Icon name={s.icon} size={16} color={catColor(s.cat)} />
              </div>
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
              <button onClick={() => onOpenService(s)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="Open">
                <Icon name="open_in_full" size={15} />
              </button>
              <button onClick={() => onEdit(s)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="Edit">
                <Icon name="edit" size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminMembers() {
  const { users } = useData();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
      {users.map((u) => (
        <div key={u.id} style={{ padding: 15, borderRadius: 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Avatar name={u.name} size={38} color={u.role === "admin" ? "var(--primary)" : "var(--originator-court)"} you={u.id === "you"} />
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}>
            <Eyebrow>Request quota</Eyebrow>
            <div style={{ flex: 1 }}>
              <ProgressBar pct={(u.reqUsed / u.reqQuota) * 100} color={u.reqUsed >= u.reqQuota ? "var(--amber)" : "var(--originator-court)"} h={5} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
              {u.reqUsed}/{u.reqQuota}
            </span>
          </div>
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
              <Icon name={s.icon} size={16} color={catColor(s.cat)} />
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
  const [tab, setTab] = useState("services");
  const [svcModal, setSvcModal] = useState<{ mode: "add" | "edit"; service?: Service } | null>(null);
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

  const onSave = async (form: ServiceForm, vis: Record<string, boolean>) => {
    const editing = svcModal?.mode === "edit";
    const id = editing ? svcModal!.service!.id : slug(form.name);
    if (!id) return;
    if (!editing && (await serviceExists(id))) {
      flash(`A service id "${id}" already exists`);
      return;
    }
    await upsertService({
      id,
      name: form.name.trim(),
      cat: form.cat,
      icon: isIconName(form.icon) ? form.icon : "dns",
      logoSlug: form.logoSlug || null,
      host: form.host.trim(),
      baseUrl: `https://${form.host.trim()}`,
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
    setSvcModal(null);
    refresh();
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
        <button onClick={() => setSvcModal({ mode: "add" })} className="btn btn-primary btn-sm">
          <Icon name="add" size={15} /> Add service
        </button>
      </PageHeader>
      <div style={{ display: "flex", gap: 4, padding: "12px 32px 0", borderBottom: "1px solid var(--outline-variant)", flexShrink: 0, overflowX: "auto" }}>
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
          onClose={() => setSvcModal(null)}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
      <Toast message={toast} />
    </section>
  );
}
