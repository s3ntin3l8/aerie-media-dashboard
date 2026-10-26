# UI/UX audit: portal

**Scope.** The authenticated portal surface: Home, Streams, Requests, Services, Status, Admin
(Services table, mobile cards, metrics controls), the embed view (`/s/[service]`), the ⌘K
command palette, modals, the mobile shell and the 404. Phone (390×844), tablet (820×1180) and
desktop (1600×1000), dark and light. Out of scope: `/login` (not captured; the demo signs in
through the first-run form before the capture starts), upstream service UIs, the PWA install flow.

**Status.** Nine P1 findings are fixed in this PR, each with a regression test. Everything else is
tracked in the [Deferred backlog](#deferred-backlog). axe-core totals on the capture set went from
120 critical `button-name` + 8 critical `select-name` + 45 serious `color-contrast` + 12 serious
`scrollable-region-focusable` nodes to none of the first three and 3 of the last (the palette, #275).

---

## How the audit was run

| Layer | Method |
|---|---|
| Visual | `capture.mjs` from the audit skill against the isolated demo (`make demo`): 12 routes × 3 viewports = 36 PNGs, plus the ⌘K palette open and the unknown-URL 404. Reviewed by eye: Home (phone), Requests (phone), Status (light, phone), Admin (phone, desktop), Streams (tablet), Embed (tablet), Palette (phone), 404 (phone, desktop). The rest were checked through axe only. |
| Automated | axe-core through `@axe-core/playwright` on every capture (`axe.json`), run before and after the fixes. |
| Code | Read against WCAG 2.2 AA: `components/modals/ModalShell.tsx` (dialog semantics, Escape, focus), `components/portal/PortalProvider.tsx` (shortcuts), `components/primitives.tsx`, `components/panels.tsx`, `components/views/admin/AdminServices.tsx`, `components/status/metricsControls.tsx`, `styles/colors_and_type.css` (token contrast, both themes), `styles/components.css` (focus, motion). |
| Computed | Contrast ratios from the real token values (both themes), now a unit test. |

Not covered: screen-reader passes, real touch devices, loading/empty/error states (the demo has data
for every panel), `/login`.

### What the code already does well

Checked and left alone. A fix here would be a regression.

- **Escape** closes a modal and stops propagation (`ModalShell`), so it doesn't also close the palette behind it.
- **Shortcuts** (`g` + letter, ⌘K, ⌘D) are suppressed while a modal is open, and while typing in an `input` or `textarea`.
- **Dark theme** accent tokens already meet AA on their own tints (checked by `tests/unit/theme-contrast.test.ts`).
- **No horizontal overflow or clipping** at phone, tablet or desktop on the reviewed captures; the Requests filter chips scroll sideways on purpose.
- **Light theme** is legible on the reviewed captures after the token fix.
- **Embed view** for a launch-only service explains itself and offers "Launch".
- The Next dev "N" badge over the mobile nav in the captures is the dev server's indicator, not the app.

---

## Severity model

- **P0**: a supported configuration renders a surface broken or unusable (blank page, crash, a screen you can't navigate or a core control you can't operate).
- **P1**: a serious defect with no workaround for the affected user: a control with no accessible name, text under AA contrast, content colliding so it can't be read, a scroll region unreachable by keyboard, a dialog without dialog semantics.
- **P2 / P3**: polish and missing nice-to-haves with a workaround (extra focus styling, motion preferences, landmarks, truncated labels).

No P0 was found.

---

## Findings

| # | Finding | Evidence | Where | What changed |
|---|---|---|---|---|
| 1 | **P1** Every toggle is a nameless button (120 nodes, critical) | axe `button-name` on Admin (Active/Keep per service), service modal visibility, logs "Auto" | `Toggle` in `components/modals/ModalShell.tsx` | `label` is now a required prop and becomes `aria-label`; all 7 callers pass one (`"<service> active"`, `"Visible to <group>"`, …); `ToggleRow` uses its title. |
| 2 | **P1** Selects with no name (8 nodes, critical) | axe `select-name` on Admin phone/tablet | Admin mobile sort select, `InstanceSelect`, `BeszelSystemSelect` | `aria-label` "Sort services", "Prometheus node", "Beszel system". |
| 3 | **P1** Admin column headers render black on navy (contrast 1.17) | axe `color-contrast` on `admin.tablet` | `sortHead` in `AdminServices.tsx` | It passed `color: undefined` in `style`, which overrode `Eyebrow`'s default and left the button's UA black. Colour is now passed as the `color` prop. |
| 4 | **P1** Light-theme accents under AA on their own tints | axe: orange 4.27–4.34, amber 2.4; unit check also flagged blue, green, red | `styles/colors_and_type.css` (`--originator-court/own/third-party`, `--amber`, `--critical`, light block only) | Darkened the five tokens to ≥4.5:1 on every surface; dark theme unchanged. |
| 5 | **P1** Requests filter counts at 0.7 opacity fall under AA (4.18) | axe `color-contrast` on `requests.tablet` | `components/views/Requests.tsx` | Dropped the opacity. |
| 6 | **P1** Phone Home card: category chip overlaps the status badge for long names ("Audiobookshelf") | `home.phone.png` before the fix | `CentralCard` in `components/panels.tsx` | Name and chip row wraps (`flexWrap`), chip is `nowrap`; the chip drops under the name instead of over the badge. |
| 7 | **P1** Unknown URL shows Next's stock white 404 with the portal's light text: unreadable | `not-found.desktop.png` before: near-invisible text, contrast 1.29 | no root `not-found` | Added `app/(portal)/[...missing]/page.tsx` calling `notFound()`, so unknown URLs get the themed in-shell 404. A root `app/not-found.tsx` was tried first and rejected: it puts `next dev` into a reload loop on `/login`. |
| 8 | **P1** Scrollable panel bodies can't be reached by keyboard | axe `scrollable-region-focusable` (12 nodes) on Home | `PanelShell` body and the horizontal item grid in `panels.tsx` | Scrolling bodies are now `role=region`, labelled with the panel title, and a tab stop. |
| 9 | **P1** Modals aren't dialogs: no role, no name, focus stays behind | code read of `ModalShell` | `components/modals/ModalShell.tsx` | `role="dialog"`, `aria-modal`, `aria-labelledby` the title; focus moves in on open and returns to the trigger on close. Tab trapping is deferred (#274). |

---

## Guardrails

- `tests/components/a11y-audit-fixes.test.tsx`: Toggle names, `PanelShell` region and tab stop, card-chip wrapping, the catch-all calling `notFound()`, dialog role/name/focus in and out.
- `tests/components/admin-sort.test.tsx`, `tests/components/metrics-controls.test.tsx`: names of the toggles and selects, and the header colour that findings 1–3 broke.
- `tests/unit/theme-contrast.test.ts`: computes WCAG contrast of every accent token on its own tint over each surface, both themes. A token edit that drops under 4.5:1 fails CI.
- `docs/audit/capture.json` now sets `"axe": true`, so re-running the capture reports axe results for every route.
- Considered and not added: a CI axe job (the capture needs a full `next dev` boot and Chromium, ~3 minutes); a jsdom axe smoke test (too many rules are meaningless without layout).

---

## Evidence

Regenerate it with the demo instance (isolated, fictional data, throwaway admin); the captures and `axe.json`
land in `docs/audit/assets/2026-10-portal-ui-ux/`, which is gitignored:

```bash
npx playwright install chromium
node <audit skill>/scripts/capture.mjs 2026-10-portal-ui-ux
```

If the demo hangs at sign-in with hundreds of "Compiled" lines in its output, delete `.next/` and
retry: a stale Turbopack cache after an interrupted run causes a reload loop.

---

## Deferred backlog

| Finding | Severity | Issue |
|---|---|---|
| Modals don't trap Tab | P2 | [#274](https://github.com/s3ntin3l8/aerie-media-dashboard/issues/274) |
| ⌘K palette has no combobox/listbox semantics; its list is an unfocusable scroll region | P2 | [#275](https://github.com/s3ntin3l8/aerie-media-dashboard/issues/275) |
| No `prefers-reduced-motion` handling | P2 | [#276](https://github.com/s3ntin3l8/aerie-media-dashboard/issues/276) |
| `:focus-visible` only styled for `.btn`; some inputs set `outline: none` | P2 | [#277](https://github.com/s3ntin3l8/aerie-media-dashboard/issues/277) |
| No level-one heading and content outside landmarks on most pages (axe `page-has-heading-one`, `region`) | P3 | [#278](https://github.com/s3ntin3l8/aerie-media-dashboard/issues/278) |
| Admin service table lacks table/`aria-sort` semantics | P3 | [#279](https://github.com/s3ntin3l8/aerie-media-dashboard/issues/279) |
| Mobile shell shows the Dashboard for unknown URLs | P3 | [#280](https://github.com/s3ntin3l8/aerie-media-dashboard/issues/280) |
| Phone Requests: truncated stat labels, FAB over the last badge; shortcuts fire in selects | P3 | [#281](https://github.com/s3ntin3l8/aerie-media-dashboard/issues/281) |
