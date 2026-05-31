"use client";
// ============================================================
// AERIE — Admin area (services · members · visibility)
// ============================================================
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { Service } from "@/lib/types";
import { catColor } from "@/lib/mock/data";
import { useData } from "@/components/portal/DataProvider";
import { Icon, Eyebrow, Pill, Chip, Avatar, Divider, ProgressBar, CatBadge } from "@/components/primitives";
import { PageHeader } from "@/components/views/shared";

function AdminServices({ onOpenService }: { onOpenService: (s: Service) => void }) {
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
              <button className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="Edit">
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
  const { services } = useData();
  const groups = ["admins", "friends", "guests"];
  const vis: Record<string, (s: Service) => boolean> = {
    admins: () => true,
    friends: (s) => s.cat !== "infra" && s.id !== "prometheus",
    guests: (s) => s.cat === "stream" || s.id === "overseerr",
  };
  const cols = `1.4fr repeat(${groups.length}, 1fr)`;
  return (
    <div className="aerie-x-scroll">
      <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "12px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
          <Eyebrow>Service → Group</Eyebrow>
          {groups.map((g) => (
            <div key={g} style={{ textAlign: "center" }}>
              <Chip icon="group">{g}</Chip>
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
              const on = vis[g](s);
              return (
                <div key={g} style={{ display: "flex", justifyContent: "center" }}>
                  <span
                    style={{
                      width: 30,
                      height: 18,
                      borderRadius: 9999,
                      position: "relative",
                      background: on ? "color-mix(in srgb, var(--originator-own) 30%, transparent)" : "color-mix(in srgb, var(--on-surface-variant) 18%, transparent)",
                      cursor: "pointer",
                      transition: "background .15s",
                    }}
                  >
                    <span style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: 9999, background: on ? "var(--originator-own)" : "var(--on-surface-variant)", transition: "left .15s" }} />
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Admin() {
  const router = useRouter();
  const [tab, setTab] = useState("services");
  const tabs: [string, string, string][] = [
    ["services", "Services & Secrets", "dns"],
    ["members", "Members", "group"],
    ["visibility", "Visibility", "visibility"],
  ];
  const openService = (s: Service) => router.push(`/s/${s.id}`);

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <PageHeader eyebrow="Lead operator" title="Admin" icon="tune" accent="var(--primary)" sub="Manage services, members and what each group can see.">
        <button className="btn btn-primary btn-sm">
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
          {tab === "services" && <AdminServices onOpenService={openService} />}
          {tab === "members" && <AdminMembers />}
          {tab === "visibility" && <AdminVisibility />}
        </div>
      </div>
    </section>
  );
}
