# Panel Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side pagination (10 items/page, prev/next controls in the panel header) to the "Recently Downloaded" and "Download Queue" panels, and increase the history fetch from 15 → 30 items so there's meaningful depth to page through.

**Architecture:** A shared `usePagination` hook and a `PageControls` component live in `components/panels.tsx` (already a "use client" file). `PanelShell` already has an `action` prop that renders on the right side of the header — that's where `PageControls` slots in. Server-side changes bump the `arrHistory` fetch cap and the `snapshot.ts` slice cap from 15 to 30.

**Tech Stack:** React 19 (`useState`, `useEffect`), Next.js App Router, TypeScript. No test runner — quality gates are `npm run typecheck`, `npm run lint`, `npm run build`.

---

## Files

| File | Change |
|---|---|
| `lib/integrations/clients.ts` | `pageSize=15` → `pageSize=30` in `arrHistory()` |
| `lib/data/snapshot.ts` | `.slice(0, 15)` → `.slice(0, 30)` |
| `components/panels.tsx` | Add `usePagination` hook + `PageControls` component; update `DownloadsPanel` and `QueuePanel` |

---

### Task 1: Increase history fetch cap

**Files:**
- Modify: `lib/integrations/clients.ts` (line 772)
- Modify: `lib/data/snapshot.ts` (line 227)

- [ ] **Step 1: Update `arrHistory` pageSize**

In `lib/integrations/clients.ts`, change the URL in `arrHistory()`:

```ts
// Before:
`${baseUrl}/api/v3/history?pageSize=15&sortKey=date&sortDirection=descending`,
// After:
`${baseUrl}/api/v3/history?pageSize=30&sortKey=date&sortDirection=descending`,
```

- [ ] **Step 2: Update snapshot slice cap**

In `lib/data/snapshot.ts`, change the slice:

```ts
// Before:
.slice(0, 15);
// After:
.slice(0, 30);
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/integrations/clients.ts lib/data/snapshot.ts
git commit -m "feat(downloads): increase history fetch cap from 15 to 30"
```

---

### Task 2: Add `usePagination` hook and `PageControls` component

**Files:**
- Modify: `components/panels.tsx` — insert after the imports block, before the first exported function

- [ ] **Step 1: Add `usePagination` hook**

Insert this function after the last `import` statement and before the first `export` in `components/panels.tsx`:

```tsx
function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const len = items.length;
  useEffect(() => { setPage(0); }, [len]);
  const totalPages = Math.max(1, Math.ceil(len / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const slice = items.slice(safePage * pageSize, (safePage + 1) * pageSize);
  return { page: safePage, totalPages, slice, setPage };
}
```

- [ ] **Step 2: Add `PageControls` component**

Insert immediately after `usePagination`:

```tsx
function PageControls({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        onClick={() => setPage(page - 1)}
        disabled={page === 0}
        style={{
          background: "none",
          border: "none",
          padding: "2px 3px",
          cursor: page === 0 ? "default" : "pointer",
          color: page === 0 ? "var(--on-surface-variant)" : "var(--primary)",
          opacity: page === 0 ? 0.35 : 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Icon name="chevron_left" size={14} />
      </button>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--on-surface-variant)",
          minWidth: 28,
          textAlign: "center",
        }}
      >
        {page + 1} / {totalPages}
      </span>
      <button
        onClick={() => setPage(page + 1)}
        disabled={page >= totalPages - 1}
        style={{
          background: "none",
          border: "none",
          padding: "2px 3px",
          cursor: page >= totalPages - 1 ? "default" : "pointer",
          color: page >= totalPages - 1 ? "var(--on-surface-variant)" : "var(--primary)",
          opacity: page >= totalPages - 1 ? 0.35 : 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Icon name="chevron_right" size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/panels.tsx
git commit -m "feat(panels): add usePagination hook and PageControls component"
```

---

### Task 3: Wire pagination into `DownloadsPanel`

**Files:**
- Modify: `components/panels.tsx` — `DownloadsPanel` function (currently lines 838–855)

- [ ] **Step 1: Replace `DownloadsPanel`**

Replace the entire `DownloadsPanel` function with:

```tsx
export function DownloadsPanel() {
  const { downloads } = useData();
  const { page, totalPages, slice, setPage } = usePagination(downloads, 10);
  if (downloads.length === 0) return null;
  return (
    <PanelShell
      title="Recently Downloaded"
      icon="download_done"
      accent="var(--originator-third-party)"
      count={`${downloads.length}`}
      action={totalPages > 1 ? <PageControls page={page} totalPages={totalPages} setPage={setPage} /> : undefined}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {slice.map((d, i) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 16px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
            <Icon name={d.svc === "radarr" ? "movie" : "live_tv"} size={14} color="var(--originator-third-party)" />
            <span style={{ fontSize: 12, color: "var(--on-surface)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</span>
            <Pill tone={d.event === "imported" ? "originator-own" : "on-surface-variant"}>{d.event}</Pill>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", minWidth: 52, textAlign: "right" }}>{timeAgo(d.when)}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/panels.tsx
git commit -m "feat(downloads): add pagination to DownloadsPanel"
```

---

### Task 4: Wire pagination into `QueuePanel`

**Files:**
- Modify: `components/panels.tsx` — `QueuePanel` function (currently lines 710–734)

- [ ] **Step 1: Replace `QueuePanel`**

Replace the entire `QueuePanel` function with:

```tsx
export function QueuePanel() {
  const { queue } = useData();
  const { page, totalPages, slice, setPage } = usePagination(queue, 10);
  return (
    <PanelShell
      title="Download Queue"
      icon="downloading"
      accent="var(--originator-third-party)"
      count={`${queue.length} active`}
      action={totalPages > 1 ? <PageControls page={page} totalPages={totalPages} setPage={setPage} /> : undefined}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {slice.map((q, i) => (
          <div key={q.id} style={{ padding: "11px 16px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <Icon name={q.svc === "radarr" ? "movie" : "live_tv"} size={14} color="var(--originator-third-party)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--on-surface)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.title}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{q.speed}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <ProgressBar pct={q.pct} color="var(--originator-third-party)" h={5} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, color: "var(--on-surface)" }}>{q.pct}%</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{q.eta}</span>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
```

- [ ] **Step 2: Run full quality gates**

```bash
npm run typecheck && npm run lint && npm run build
```
Expected: all three pass with no errors.

- [ ] **Step 3: Commit**

```bash
git add components/panels.tsx
git commit -m "feat(queue): add pagination to QueuePanel"
```
