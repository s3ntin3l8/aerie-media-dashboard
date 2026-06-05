"use client";
// ============================================================
// AERIE — Request modal (ported from RequestModal.jsx)
//   mode 'request': member discovers a title → quality/seasons → submit
//   mode 'review' : admin approves/declines a pending request with a note
// Search hits /api/discover (real Overseerr when keyed, else empty results);
// quality profiles are fetched live from Radarr/Sonarr via Overseerr.
// Approve/decline reuse the optimistic path in the Requests view.
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import type { DiscoverItem, MediaRequest, QualityProfile, RequestStatus, User } from "@/lib/types";
import { Icon, Pill, Eyebrow, Avatar, Chip, PosterTile, ProgressBar, Divider } from "@/components/primitives";
import { ModalShell, SectionLabel, Field, fieldInput } from "@/components/modals/ModalShell";
import { useData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { QUALITY_PROFILES } from "@/lib/categories";
import { getQualityProfiles, type SubmitResult } from "@/app/(portal)/requests/actions";
import { REQ_TONE as RQ_TONE, REQ_LABEL as RQ_LABEL } from "@/lib/display";

const REQ_C = "var(--originator-court)";

// "Default" sends no profileId override. Sending an explicit profile is an
// Overseerr *advanced* request option that requires the REQUEST_ADVANCED
// permission — non-privileged users get a 403 if we force one. Defaulting to
// the server profile keeps requests working for everyone; picking a specific
// profile stays available for users who have the permission.
const DEFAULT_PROFILE: QualityProfile = { id: "default", label: "Default", sub: "Server default", icon: "auto_awesome" };

function StateBadge({ state }: { state: RequestStatus | null }) {
  if (!state) return null;
  return <Pill tone={RQ_TONE[state]}>{RQ_LABEL[state]}</Pill>;
}

function DiscoverStep({ me, q, setQ, onPick }: { me: User; q: string; setQ: (v: string) => void; onPick: (d: DiscoverItem) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 40);
  }, []);
  // Show the combined quota state: restricted if either type is restricted (pre-pick), or just movie/TV when known.
  const movieAtQuota = me.movieQuota?.restricted ?? false;
  const tvAtQuota = me.tvQuota?.restricted ?? false;
  const atQuota = movieAtQuota && tvAtQuota;

  // Type-ahead against /api/discover (real Overseerr search, or mock catalog),
  // debounced with an AbortController so superseded keystrokes cancel.
  const [results, setResults] = useState<DiscoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/discover?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: "no-store" });
        if (res.ok) setResults((await res.json()) as DiscoverItem[]);
      } catch {
        /* aborted or failed — keep last results */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q]);

  return (
    <>
      <div style={{ padding: "16px 20px 12px", position: "sticky", top: 0, background: "var(--surface-container-lowest)", zIndex: 1, borderBottom: "1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)" }}>
        <div style={{ position: "relative" }}>
          <Icon name="search" size={18} color="var(--on-surface-variant)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input ref={inputRef} className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies & shows…" style={{ paddingLeft: 40, paddingTop: 11, paddingBottom: 11, fontSize: 14 }} />
        </div>
        {me.movieQuota != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, flexWrap: "wrap", rowGap: 4 }}>
            {([["movie", "Movies", me.movieQuota, movieAtQuota], ["live_tv", "TV", me.tvQuota, tvAtQuota]] as const).map(([icon, label, quota, at]) => quota && (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 120 }}>
                <Icon name={icon} size={13} color={at ? "var(--amber)" : REQ_C} />
                <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>{label}</span>
                <div style={{ flex: 1, minWidth: 44 }}>
                  <ProgressBar pct={quota.limit ? Math.min(100, (quota.used / quota.limit) * 100) : 0} color={at ? "var(--amber)" : REQ_C} h={5} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: at ? "var(--amber)" : "var(--on-surface-variant)", fontWeight: at ? 700 : 400 }}>
                  {quota.used}/{quota.limit ?? "∞"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: "6px 14px 16px" }}>
        {atQuota && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "6px 6px 10px", padding: "9px 13px", borderRadius: 10, background: "color-mix(in srgb, var(--amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--amber) 28%, transparent)" }}>
            <Icon name="info" size={16} color="var(--amber)" />
            <span style={{ fontSize: 12, color: "var(--on-surface)" }}>You&rsquo;ve used all your requests for both movies and TV. Ask an admin to raise your quota.</span>
          </div>
        )}
        {results.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "var(--on-surface-variant)" }}>{loading ? "Searching…" : <>No titles match &ldquo;{q}&rdquo;.</>}</div>
        ) : (
          results.map((d) => {
            const inLib = d.state === "available";
            const requested = d.state === "pending" || d.state === "approved";
            const itemAtQuota = d.kind === "series" ? tvAtQuota : movieAtQuota;
            const blocked = itemAtQuota;
            return (
              <button
                key={d.id}
                type="button"
                disabled={blocked}
                onClick={() => !blocked && onPick(d)}
                className="req-result"
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "9px 10px", borderRadius: 11, border: "none", background: "transparent", cursor: blocked ? "default" : "pointer", textAlign: "left" }}
              >
                <PosterTile title={d.title} kind={d.kind} cat="request" w={42} art={d.art} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-headline)", fontWeight: 700, fontSize: 13.5, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>
                    <Icon name={d.kind === "series" ? "live_tv" : "movie"} size={12} />
                    {d.kind === "series" ? "Series" : "Movie"} · {d.year}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "var(--amber)" }}>
                      <Icon name="star" size={11} fill />
                      {d.rating}
                    </span>
                  </div>
                </div>
                {d.state ? <StateBadge state={d.state} /> : <Icon name="add_circle" size={20} color={itemAtQuota ? "var(--on-surface-variant)" : REQ_C} />}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function InfoStep({ pick }: { pick: DiscoverItem }) {
  return (
    <div style={{ padding: "18px 20px 22px" }}>
      <div style={{ display: "flex", gap: 15, alignItems: "flex-start" }}>
        <PosterTile title={pick.title} kind={pick.kind} cat="request" w={72} art={pick.art} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 18, color: "var(--on-surface)", lineHeight: 1.15 }}>{pick.title}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--on-surface-variant)", flexWrap: "wrap" }}>
            <Icon name={pick.kind === "series" ? "live_tv" : "movie"} size={13} />
            {pick.kind === "series" ? "Series" : "Movie"} · {pick.year}
            {pick.rating > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--amber)" }}>
                <Icon name="star" size={13} fill />
                {pick.rating}
              </span>
            )}
            {pick.state && <StateBadge state={pick.state} />}
          </div>
          {pick.overview && (
            <p style={{ fontSize: 12.5, color: "var(--on-surface-variant)", marginTop: 9, lineHeight: 1.5 }}>{pick.overview}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmStep({
  pick,
  quality,
  setQuality,
  seasons,
  setSeasons,
  onBack,
  onProfilesLoad,
  preloadedProfiles,
}: {
  pick: DiscoverItem;
  quality: string;
  setQuality: (q: string) => void;
  seasons: Record<number, boolean>;
  setSeasons: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onBack: () => void;
  onProfilesLoad: (ps: QualityProfile[]) => void;
  preloadedProfiles: QualityProfile[];
}) {
  const selCount = Object.keys(seasons).filter((k) => seasons[Number(k)]).length;
  // Prepend the "Default" (no-override) option so requests don't carry an
  // advanced profileId unless the user deliberately picks a specific profile.
  const profiles = React.useMemo(
    () => [DEFAULT_PROFILE, ...(preloadedProfiles.length > 0 ? preloadedProfiles : QUALITY_PROFILES).filter((p) => p.id !== "default")],
    [preloadedProfiles],
  );

  useEffect(() => {
    onProfilesLoad(profiles);
    setQuality("default");
  }, [profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div style={{ padding: "18px 20px 6px" }}>
        <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ paddingLeft: 7, marginBottom: 12 }}>
          <Icon name="arrow_back" size={15} /> Back to results
        </button>
        <div style={{ display: "flex", gap: 15, alignItems: "flex-start" }}>
          <PosterTile title={pick.title} kind={pick.kind} cat="request" w={72} art={pick.art} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 18, color: "var(--on-surface)", lineHeight: 1.15 }}>{pick.title}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--on-surface-variant)" }}>
              <Icon name={pick.kind === "series" ? "live_tv" : "movie"} size={13} />
              {pick.kind === "series" ? "Series" : "Movie"} · {pick.year}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--amber)" }}>
                <Icon name="star" size={13} fill />
                {pick.rating}
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--on-surface-variant)", marginTop: 9, lineHeight: 1.5 }}>{pick.overview}</p>
          </div>
        </div>
      </div>
      <div style={{ padding: "14px 20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        <Divider />
        <section>
          <SectionLabel>Quality profile</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {profiles.map((p) => {
              const sel = quality === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setQuality(p.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 4,
                    padding: "11px 13px",
                    borderRadius: 11,
                    cursor: "pointer",
                    textAlign: "left",
                    border: "1px solid " + (sel ? `color-mix(in srgb, ${REQ_C} 55%, transparent)` : "var(--outline-variant)"),
                    background: sel ? `color-mix(in srgb, ${REQ_C} 12%, transparent)` : "transparent",
                    transition: "all .14s",
                  }}
                >
                  <Icon name={p.icon} size={18} color={sel ? REQ_C : "var(--on-surface-variant)"} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: sel ? REQ_C : "var(--on-surface)" }}>{p.label}</span>
                  {p.sub && <span style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>{p.sub}</span>}
                </button>
              );
            })}
          </div>
        </section>
        {pick.kind === "series" && pick.seasons && (
          <section>
            <SectionLabel hint={`${selCount} of ${pick.seasons} selected`}>Seasons</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {Array.from({ length: pick.seasons }).map((_, i) => {
                const num = i + 1,
                  on = seasons[num];
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSeasons((s) => ({ ...s, [num]: !s[num] }))}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 13px",
                      borderRadius: 9,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      border: "1px solid " + (on ? `color-mix(in srgb, ${REQ_C} 50%, transparent)` : "var(--outline-variant)"),
                      background: on ? `color-mix(in srgb, ${REQ_C} 12%, transparent)` : "transparent",
                      color: on ? REQ_C : "var(--on-surface-variant)",
                    }}
                  >
                    <Icon name={on ? "check_circle" : "radio_button_unchecked"} size={14} />
                    Season {num}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function ResultPanel({ icon, color, title, body, onClose, extra }: { icon: string; color: string; title: string; body: React.ReactNode; onClose: () => void; extra?: React.ReactNode }) {
  return (
    <div style={{ padding: "36px 26px 30px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${color} 16%, transparent)`, marginBottom: 16 }}>
        <Icon name={icon} size={30} color={color} />
      </div>
      <h3 style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 18, color: "var(--on-surface)" }}>{title}</h3>
      <p style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 7, maxWidth: 350, lineHeight: 1.5 }}>{body}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
        {extra}
        <button onClick={onClose} className="btn btn-primary btn-sm">
          Done
        </button>
      </div>
    </div>
  );
}

function ReviewBody({ req, note, setNote, requester }: { req: MediaRequest; note: string; setNote: (v: string) => void; requester?: User }) {
  const u = requester;
  const fact = (label: string, value: React.ReactNode, mono?: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Eyebrow>{label}</Eyebrow>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-surface)", fontFamily: mono ? "var(--font-mono)" : "var(--font-body)" }}>{value}</span>
    </div>
  );
  return (
    <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 15, alignItems: "flex-start" }}>
        <PosterTile title={req.title} kind={req.kind} cat="request" w={68} art={req.art} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 18, color: "var(--on-surface)", lineHeight: 1.15 }}>{req.title}</h3>
            <span style={{ marginLeft: "auto" }}>
              <Pill tone={RQ_TONE[req.status]}>{RQ_LABEL[req.status]}</Pill>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--on-surface-variant)" }}>
            <Icon name={req.kind === "series" ? "live_tv" : "movie"} size={13} />
            {req.kind === "series" ? "Series" : "Movie"} · {req.year}
            <span style={{ opacity: 0.6 }}>·</span>
            {req.id}
          </div>
        </div>
      </div>
      {(u || req.requesterName) && (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderRadius: 12, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)" }}>
          <Avatar name={u?.name ?? req.requesterName} src={u?.avatar ?? req.requesterAvatar} size={36} color={REQ_C} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 13.5, color: "var(--on-surface)" }}>{u?.name ?? req.requesterName}</span>
              {(u?.groups || []).map((g) => (
                <Chip key={g} icon="group">
                  {g}
                </Chip>
              ))}
            </div>
            {u?.email && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", marginTop: 1 }}>{u.email}</div>}
          </div>
          {u && (() => {
            const quota = req.kind === "series" ? u.tvQuota : u.movieQuota;
            if (!quota) return null;
            return (
              <div style={{ textAlign: "right" }}>
                <Eyebrow>{req.kind === "series" ? "TV quota" : "Movie quota"}</Eyebrow>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: quota.restricted ? "var(--amber)" : "var(--on-surface)", marginTop: 3 }}>
                  {quota.used}/{quota.limit ?? "∞"}
                </div>
              </div>
            );
          })()}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: req.fileInfo ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 14, padding: "13px 15px", borderRadius: 12, background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
        {fact("Requested", req.requested)}
        {fact("Quality", req.qualityProfile ?? "—", true)}
        {fact(
          req.kind === "series" ? "Seasons" : "Type",
          req.kind === "series"
            ? req.seasons && req.seasons.length > 0
              ? req.seasons.map((n) => `S${n}`).join(", ")
              : "All"
            : "Movie",
        )}
        {req.fileInfo && fact("File", (
          <span>
            {req.fileInfo.label}
            {req.fileInfo.sizeBytes != null && (
              <span style={{ fontWeight: 400, color: "var(--on-surface-variant)", marginLeft: 4 }}>
                ({(req.fileInfo.sizeBytes / 1e9).toFixed(1)} GB)
              </span>
            )}
          </span>
        ), true)}
      </div>
      {req.overview && (
        <p style={{ fontSize: 12.5, color: "var(--on-surface-variant)", lineHeight: 1.5, margin: 0 }}>{req.overview}</p>
      )}
      <Field label="Note to requester" hint="posted as an Overseerr comment">
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a comment visible in Overseerr…" style={{ ...fieldInput, resize: "vertical", fontFamily: "var(--font-body)", lineHeight: 1.5 }} />
      </Field>
    </div>
  );
}

export function RequestModal({
  open,
  mode,
  request,
  initialQuery,
  initialPick,
  initialSelectedSeasons,
  onClose,
  onSubmit,
  onAct,
}: {
  open: boolean;
  mode: "request" | "review";
  request?: MediaRequest | null;
  initialQuery?: string;
  /** When set, skip the DiscoverStep and open ConfirmStep with this item pre-selected. */
  initialPick?: DiscoverItem | null;
  /** Exact season numbers to preselect when editing an existing TV request. */
  initialSelectedSeasons?: number[];
  onClose: () => void;
  onSubmit: (pick: DiscoverItem, quality: string, seasons: Record<number, boolean>) => void | Promise<SubmitResult | void>;
  onAct: (id: string, action: "approve" | "decline", note?: string, mediaOverseerrId?: number) => void;
}) {
  const { users } = useData();
  const { user } = usePortal();
  const me = users.find((u) => u.id === user.id) ?? users[0];
  const review = mode === "review";

  const [q, setQ] = useState("");
  const [pick, setPick] = useState<DiscoverItem | null>(null);
  const [quality, setQuality] = useState("default");
  const [qualityProfiles, setQualityProfiles] = useState<QualityProfile[]>(QUALITY_PROFILES);
  const [movieProfiles, setMovieProfiles] = useState<QualityProfile[]>([]);
  const [tvProfiles, setTvProfiles] = useState<QualityProfile[]>([]);
  const [seasons, setSeasons] = useState<Record<number, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<"approved" | "declined" | null>(null);

  const choosePick = (d: DiscoverItem, selectedSeasons?: number[]) => {
    setPick(d);
    if (d.kind === "series") {
      const s: Record<number, boolean> = {};
      if (selectedSeasons) {
        for (const season of selectedSeasons) s[season] = true;
      } else {
        for (let i = 1; i <= (d.seasons || 1); i++) s[i] = true;
      }
      setSeasons(s);
    }
    setQuality("default");
  };

  useEffect(() => {
    if (open) {
      setQ(initialQuery || "");
      setQuality("default");
      setSubmitted(false);
      setSubmitting(false);
      setResult(null);
      setNote("");
      if (initialPick) {
        choosePick(initialPick, initialSelectedSeasons);
      } else {
        setPick(null);
        setSeasons({});
      }
      setDecision(null);
      const reloadIfStale = (e: unknown) => {
        if (String(e).includes("Failed to find Server Action")) window.location.reload();
      };
      getQualityProfiles("movie").then(setMovieProfiles).catch(reloadIfStale);
      getQualityProfiles("tv").then(setTvProfiles).catch(reloadIfStale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, request?.id]);
  const submitRequest = async () => {
    if (!pick) return;
    setSubmitting(true);
    let r: SubmitResult | void;
    try {
      r = await onSubmit(pick, quality, seasons);
    } catch (e) {
      r = { ok: false, message: e instanceof Error ? e.message : "Request failed" };
    }
    setSubmitting(false);
    // Older callers may not return a result; treat that as a plain success.
    setResult(r ?? { ok: true, message: "Request submitted" });
    setSubmitted(true);
  };
  const act = (verdict: "approved" | "declined") => {
    if (request) onAct(request.id, verdict === "approved" ? "approve" : "decline", note || undefined, request.mediaOverseerrId);
    setDecision(verdict);
  };

  const requester = request ? users.find((u) => u.id === request.user) : undefined;

  const canAct = request?.status === "pending";

  let footer: React.ReactNode = null;
  if (review && request && !decision && canAct) {
    footer = (
      <>
        <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ marginRight: "auto" }}>
          Cancel
        </button>
        <button onClick={() => act("declined")} className="btn btn-secondary btn-sm" style={{ color: "var(--error)" }}>
          <Icon name="block" size={15} /> Decline
        </button>
        <button onClick={() => act("approved")} className="btn btn-primary btn-sm">
          <Icon name="check" size={15} /> Approve
        </button>
      </>
    );
  } else if (review && request && !decision && !canAct) {
    footer = (
      <button onClick={onClose} className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }}>
        Close
      </button>
    );
  } else if (!review && pick && pick.state && !submitted) {
    footer = (
      <button onClick={onClose} className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }}>
        Close
      </button>
    );
  } else if (!review && pick && !submitted) {
    const qp = qualityProfiles.find((p) => p.id === quality) ?? qualityProfiles[0];
    const seasonCount = Object.keys(seasons).filter((k) => seasons[Number(k)]).length;
    const noSeasons = pick.kind === "series" && seasonCount === 0;
    footer = (
      <>
        <span style={{ marginRight: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>
          {qp.label}
          {pick.kind === "series" ? ` · ${seasonCount} season${seasonCount === 1 ? "" : "s"}` : ""}
        </span>
        <button onClick={() => setPick(null)} className="btn btn-secondary btn-sm">
          Back
        </button>
        <button onClick={submitRequest} disabled={noSeasons || submitting} className="btn btn-primary btn-sm">
          <Icon name="send" size={15} /> {submitting ? "Submitting…" : "Submit request"}
        </button>
      </>
    );
  }

  const reviewSubMap: Partial<Record<string, string>> = {
    approved: "Already approved — processing in the download queue.",
    processing: "Already approved — processing in the download queue.",
    available: "Already available in the library.",
    declined: "This request was declined.",
    failed: "This request failed to process.",
  };
  const title = review ? "Review request" : "Request media";
  const sub = review
    ? (request && reviewSubMap[request.status]) ?? "Approve or decline — the member is notified."
    : "Search the catalog and send it to the request queue.";

  return (
    <ModalShell open={open} onClose={onClose} accent={REQ_C} icon="playlist_add" title={title} sub={sub} footer={footer} width={review ? 560 : 600}>
      {open && review && request && (
        decision ? (
          <ResultPanel
            icon={decision === "approved" ? "check" : "block"}
            color={decision === "approved" ? "var(--originator-own)" : "var(--error)"}
            title={decision === "approved" ? "Request approved" : "Request declined"}
            body={
              <>
                <strong style={{ color: "var(--on-surface)" }}>{requester?.name ?? "The requester"}</strong>
                {decision === "approved" ? ` will be notified — ${request.title} is queued for download.` : ` will be notified that ${request.title} was declined.`}
              </>
            }
            onClose={onClose}
          />
        ) : (
          <ReviewBody req={request} note={note} setNote={setNote} requester={requester} />
        )
      )}
      {open && !review && (
        submitted && pick ? (
          result && !result.ok ? (
            <ResultPanel
              icon="error"
              color="var(--error)"
              title="Request failed"
              body={
                <>
                  Couldn&rsquo;t request <strong style={{ color: "var(--on-surface)" }}>{pick.title}</strong>. {result.message}
                </>
              }
              onClose={onClose}
              extra={
                <button onClick={() => { setSubmitted(false); setResult(null); }} className="btn btn-secondary btn-sm">
                  <Icon name="refresh" size={15} /> Try again
                </button>
              }
            />
          ) : (
            <ResultPanel
              icon="check"
              color="var(--originator-own)"
              title={result?.autoApproved ? "Request approved" : "Request submitted"}
              body={
                result?.autoApproved ? (
                  <>
                    <strong style={{ color: "var(--on-surface)" }}>{pick.title}</strong>{" "}was approved and is being added now. You&rsquo;ll be notified when it&rsquo;s ready to watch.
                  </>
                ) : (
                  <>
                    <strong style={{ color: "var(--on-surface)" }}>{pick.title}</strong>{" "}is pending approval. You&rsquo;ll be notified when it&rsquo;s available to watch.
                  </>
                )
              }
              onClose={onClose}
              extra={
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setResult(null);
                    setPick(null);
                    setQ("");
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  <Icon name="add" size={15} /> Request another
                </button>
              }
            />
          )
        ) : pick && pick.state ? (
          <InfoStep pick={pick} />
        ) : pick ? (
          <ConfirmStep pick={pick} quality={quality} setQuality={setQuality} seasons={seasons} setSeasons={setSeasons} onBack={() => setPick(null)} onProfilesLoad={setQualityProfiles} preloadedProfiles={pick.kind === "series" ? tvProfiles : movieProfiles} />
        ) : (
          <DiscoverStep me={me} q={q} setQ={setQ} onPick={choosePick} />
        )
      )}
    </ModalShell>
  );
}
