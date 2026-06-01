"use client";
// ============================================================
// AERIE — Request modal (ported from RequestModal.jsx)
//   mode 'request': member discovers a title → quality/seasons → submit
//   mode 'review' : admin approves/declines a pending request with a note
// Search hits /api/discover (real Overseerr when keyed, else empty results);
// quality profiles are a static list (lib/categories.ts). Approve/decline reuse
// the optimistic path in the Requests view.
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import type { DiscoverItem, MediaRequest, RequestStatus, User } from "@/lib/types";
import { Icon, Pill, Eyebrow, Avatar, Chip, PosterTile, ProgressBar, Divider } from "@/components/primitives";
import { ModalShell, SectionLabel, Field, fieldInput } from "@/components/modals/ModalShell";
import { useData } from "@/components/portal/DataProvider";
import { QUALITY_PROFILES } from "@/lib/categories";

const RQ_TONE: Record<string, string> = { available: "originator-own", approved: "originator-court", pending: "amber", declined: "error" };
const RQ_LABEL: Record<string, string> = { available: "In library", approved: "Approved", pending: "Requested", declined: "Declined" };
const REQ_C = "var(--originator-court)";

function StateBadge({ state }: { state: RequestStatus | null }) {
  if (!state) return null;
  return <Pill tone={RQ_TONE[state]}>{RQ_LABEL[state]}</Pill>;
}

function DiscoverStep({ me, q, setQ, onPick }: { me: User; q: string; setQ: (v: string) => void; onPick: (d: DiscoverItem) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 40);
  }, []);
  const atQuota = me.reqUsed >= me.reqQuota;

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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}>
          <Icon name="data_usage" size={14} color={atQuota ? "var(--amber)" : REQ_C} />
          <span style={{ fontSize: 11.5, color: "var(--on-surface-variant)" }}>Request quota</span>
          <div style={{ flex: 1, maxWidth: 130 }}>
            <ProgressBar pct={(me.reqUsed / me.reqQuota) * 100} color={atQuota ? "var(--amber)" : REQ_C} h={5} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: atQuota ? "var(--amber)" : "var(--on-surface-variant)", fontWeight: atQuota ? 700 : 400 }}>
            {me.reqUsed}/{me.reqQuota} used
          </span>
        </div>
      </div>
      <div style={{ padding: "6px 14px 16px" }}>
        {atQuota && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "6px 6px 10px", padding: "9px 13px", borderRadius: 10, background: "color-mix(in srgb, var(--amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--amber) 28%, transparent)" }}>
            <Icon name="info" size={16} color="var(--amber)" />
            <span style={{ fontSize: 12, color: "var(--on-surface)" }}>You&rsquo;ve used all your requests. Ask an admin to raise your quota.</span>
          </div>
        )}
        {results.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "var(--on-surface-variant)" }}>{loading ? "Searching…" : <>No titles match &ldquo;{q}&rdquo;.</>}</div>
        ) : (
          results.map((d) => {
            const inLib = d.state === "available";
            const requested = d.state === "pending" || d.state === "approved";
            const blocked = inLib || requested || atQuota;
            return (
              <button
                key={d.id}
                type="button"
                disabled={blocked}
                onClick={() => !blocked && onPick(d)}
                className="req-result"
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "9px 10px", borderRadius: 11, border: "none", background: "transparent", cursor: blocked ? "default" : "pointer", textAlign: "left", opacity: atQuota && !blocked ? 0.5 : 1 }}
              >
                <PosterTile title={d.title} kind={d.kind} cat="request" w={42} />
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
                {d.state ? <StateBadge state={d.state} /> : <Icon name="add_circle" size={20} color={atQuota ? "var(--on-surface-variant)" : REQ_C} />}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function ConfirmStep({
  pick,
  quality,
  setQuality,
  seasons,
  setSeasons,
  onBack,
}: {
  pick: DiscoverItem;
  quality: string;
  setQuality: (q: string) => void;
  seasons: Record<number, boolean>;
  setSeasons: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onBack: () => void;
}) {
  const selCount = Object.keys(seasons).filter((k) => seasons[Number(k)]).length;
  return (
    <>
      <div style={{ padding: "18px 20px 6px" }}>
        <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ paddingLeft: 7, marginBottom: 12 }}>
          <Icon name="arrow_back" size={15} /> Back to results
        </button>
        <div style={{ display: "flex", gap: 15 }}>
          <PosterTile title={pick.title} kind={pick.kind} cat="request" w={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 18, color: "var(--on-surface)", lineHeight: 1.15 }}>{pick.title}</h3>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {QUALITY_PROFILES.map((p) => {
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
                  <span style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>{p.sub}</span>
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
      <div style={{ display: "flex", gap: 15 }}>
        <PosterTile title={req.title} kind={req.kind} cat="request" w={68} art={req.art} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <h3 style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 18, color: "var(--on-surface)", lineHeight: 1.15 }}>{req.title}</h3>
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
          <Avatar name={u?.name ?? req.requesterName} size={36} color={REQ_C} />
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
          {u && (
            <div style={{ textAlign: "right" }}>
              <Eyebrow>Quota</Eyebrow>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: u.reqUsed >= u.reqQuota ? "var(--amber)" : "var(--on-surface)", marginTop: 3 }}>
                {u.reqUsed}/{u.reqQuota}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, padding: "13px 15px", borderRadius: 12, background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
        {fact("Requested", req.requested)}
        {fact("Quality", "1080p", true)}
        {fact(req.kind === "series" ? "Seasons" : "Type", req.kind === "series" ? "All" : "Movie")}
      </div>
      <Field label="Note to requester" hint="optional">
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a message they'll see with the decision…" style={{ ...fieldInput, resize: "vertical", fontFamily: "var(--font-body)", lineHeight: 1.5 }} />
      </Field>
    </div>
  );
}

export function RequestModal({
  open,
  mode,
  request,
  initialQuery,
  onClose,
  onSubmit,
  onAct,
}: {
  open: boolean;
  mode: "request" | "review";
  request?: MediaRequest | null;
  initialQuery?: string;
  onClose: () => void;
  onSubmit: (pick: DiscoverItem, quality: string, seasons: Record<number, boolean>) => void;
  onAct: (id: string, action: "approve" | "decline") => void;
}) {
  const { users } = useData();
  const me = users.find((u) => u.id === "you") ?? users[0];
  const review = mode === "review";

  const [q, setQ] = useState("");
  const [pick, setPick] = useState<DiscoverItem | null>(null);
  const [quality, setQuality] = useState("hd1080");
  const [seasons, setSeasons] = useState<Record<number, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<"approved" | "declined" | null>(null);

  useEffect(() => {
    if (open) {
      setQ(initialQuery || "");
      setPick(null);
      setQuality("hd1080");
      setSeasons({});
      setSubmitted(false);
      setNote("");
      setDecision(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, request?.id]);

  const choosePick = (d: DiscoverItem) => {
    setPick(d);
    if (d.kind === "series") {
      const s: Record<number, boolean> = {};
      for (let i = 1; i <= (d.seasons || 1); i++) s[i] = true;
      setSeasons(s);
    }
    setQuality("hd1080");
  };
  const submitRequest = () => {
    if (pick) onSubmit(pick, quality, seasons);
    setSubmitted(true);
  };
  const act = (verdict: "approved" | "declined") => {
    if (request) onAct(request.id, verdict === "approved" ? "approve" : "decline");
    setDecision(verdict);
  };

  const requester = request ? users.find((u) => u.id === request.user) : undefined;

  let footer: React.ReactNode = null;
  if (review && request && !decision) {
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
  } else if (!review && pick && !submitted) {
    const qp = QUALITY_PROFILES.find((p) => p.id === quality)!;
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
        <button onClick={submitRequest} disabled={noSeasons} className="btn btn-primary btn-sm">
          <Icon name="send" size={15} /> Submit request
        </button>
      </>
    );
  }

  const title = review ? "Review request" : "Request media";
  const sub = review ? "Approve or decline — the member is notified." : "Search the catalog and send it to the request queue.";

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
          <ResultPanel
            icon="check"
            color="var(--originator-own)"
            title="Request submitted"
            body={
              <>
                <strong style={{ color: "var(--on-surface)" }}>{pick.title}</strong> is pending approval. You&rsquo;ll be notified when it&rsquo;s available to watch.
              </>
            }
            onClose={onClose}
            extra={
              <button
                onClick={() => {
                  setSubmitted(false);
                  setPick(null);
                  setQ("");
                }}
                className="btn btn-secondary btn-sm"
              >
                <Icon name="add" size={15} /> Request another
              </button>
            }
          />
        ) : pick ? (
          <ConfirmStep pick={pick} quality={quality} setQuality={setQuality} seasons={seasons} setSeasons={setSeasons} onBack={() => setPick(null)} />
        ) : (
          <DiscoverStep me={me} q={q} setQ={setQ} onPick={choosePick} />
        )
      )}
    </ModalShell>
  );
}
