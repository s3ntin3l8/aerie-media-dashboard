# Widget deduplication & dynamic config — roadmap

Tracking: [#31](https://github.com/s3ntin3l8/aerie-media-dashboard/issues/31)

## Goal

Widgets should be defined by **function**, not by provider. A user should be able to configure each
widget's **data source** (scoped to the services that provide that function), the **number of
items/stats** shown, and the **layout**.

## Where we already are

AERIE already has a mature, data-driven widget system — most of "dynamic item count + layout" is
built:

- A 30-entry catalog (`components/portal/widgetCatalog.tsx`) grouped into
  Overview / Streaming / Monitoring / Services / Requests / Automation.
- A per-tile `settings` framework — `WidgetSettingSpec` (`count` / `select` / `toggle` / `text` /
  `links` / `serviceIds` / `libraryIds`) + `CardSettingsModal` + `resolveSettings()`.
- A 12-column drag/resize grid (`components/portal/GridDashboard.tsx`).
- Per-role persistence in `preferences.dashboards` (`getDashboards` / `setDashboards` /
  `setDashboardsAction`).

## The actual gaps

1. **No per-widget data-source picker.** Source is either a hardcoded server-side cascade (Now
   Playing merges Plex/Jellyfin/ABS; Library & Recent default Tautulli→Jellyfin) or a
   *deployment-global* toggle (`metricsSource`, `queueSource`) — never a per-tile choice.
2. **Provider-named widgets that are one function:** Indexers = Prowlarr **+** NZBHydra2;
   Books = LazyLibrarian **+** Listenarr.
3. **Gap widgets** missing from the grid: Host Stats, Storage/Filesystems, *arr Health, 24h Activity.

## Decisions

- **Consolidation = functional merge + source pick.** Merge only where 2+ providers serve the same
  function (Indexers, Books). Keep bespoke widgets (Subtitles, Invites, Collections, Torrents) with
  their tailored rendering, just function-named.
- **Source model = per-widget picker.** Each tile chooses its source (Auto / specific service). This
  requires the snapshot to stop pre-merging and instead expose per-source data.
- **Add all four** new gap widgets.

This is a multi-PR roadmap. Each phase below is a shippable PR.

---

## Phase 0 — Source-selection primitive (foundation)

- New `WidgetSettingSpec` variant `"source"` (with a `capability` field) in `widgetCatalog.tsx`.
- New `lib/widgets/capabilities.ts` — a `CAPABILITY_PROVIDERS` map (capability → candidate
  serviceIds) and `sourceOptions(capability, services)` returning `Auto` + the *configured* providers.
  Capabilities: `nowPlaying`, `library`, `recent`, `queue`, `metrics`, `indexers`, `books`.
- `CardSettingsModal.tsx` renders the `"source"` spec as a `<select>` populated from
  `sourceOptions()`, defaulting to `Auto`. (`resolveSettings()` needs no change — it passes arbitrary
  keys through.)

## Phase 1 — Data layer: collect-all + tag-by-source

Stop cascading multi-source capabilities to a single winner; collect every configured source's items
and tag each with its `source` serviceId. `Auto` reproduces today's merge/priority behaviour; a
specific source filters by tag (in the panel).

- `lib/types.ts` — add `source: string` to `LibraryStat` and `RecentItem` (NowPlaying already carries
  `src`).
- `lib/integrations/clients.ts` — tag library/recent items with their provider id.
- `lib/data/snapshot.ts` — change `library` / `recent` from priority-cascade to collect-all-tagged.
- **Metrics special case:** Prometheus/Beszel reads are live & uncached and there can be >1 host
  tile. Expose `metricsBySource: { prometheus?: NodeMetrics; beszel?: NodeMetrics }` computed only
  for configured+active sources (bounded to 2), each behind a short `cached()` TTL to bound cost.
  Keep `metrics` / `metricsSource` for `Auto` / back-compat.

## Phase 2 — Functional merges + source pickers

- Merge `prowlarr` + `nzbhydra` → one **`indexers`** widget (source select); `lazylibrarian` +
  `listenarr` → one **`books`** widget (source select). Keep the per-stat toggles.
- Add a `"source"` setting to `nowPlaying`, `libraryStats`, `recentlyAdded`, `queue`, wiring the
  chosen source into the panels (`components/panels.tsx`); `Auto` = unfiltered.
- Ensure remaining provider-named widgets use functional display names (most already do). **Keep
  `type` keys stable** to avoid breaking saved layouts.
- **Migration:** a normalizer in the dashboards loader maps deprecated `type`s
  (`prowlarr`→`indexers`+`{source:"prowlarr"}`, `nzbhydra`→`indexers`, `lazylibrarian`/`listenarr`→
  `books`) so stored dashboards don't render "Unknown widget".

## Phase 3 — New gap widgets (`components/widgets.tsx` + catalog)

- **Host Stats** (Monitoring) — CPU/mem/disk/net/load/uptime cards with a `metrics` source pick, plus
  Beszel-only detail (online status, EFS mounts). Reuses the Status-page MetricCard rendering; adds
  the new Beszel fields to `NodeMetrics` / `beszelMetrics()`.
- **Storage / Filesystems** — wire the existing `StoragePanel` into the catalog (per-mount usage bars).
- **Health / *arr Warnings** — `arrHealth[]` list, currently only on `/status`.
- **24h Activity / Plays** — `plays24h` histogram as a standalone widget.

## Phase 4 — Dynamic-config uniformity

Audit every data widget so three axes are consistent: **source** (where multi-source), **item/stat
count** (`limit` or stat toggles), and **layout/variant** (a standard `select`: list/grid/compact)
where meaningful, plus `title`.

---

## Critical files

- `components/portal/widgetCatalog.tsx` — `"source"` spec, merged/new entries, settings.
- `components/modals/CardSettingsModal.tsx` — render the source select.
- `lib/widgets/capabilities.ts` *(new)* — capability→providers map + `sourceOptions()`.
- `components/widgets.tsx`, `components/panels.tsx` — merged widgets, source-aware panels, new widgets.
- `lib/data/snapshot.ts`, `lib/integrations/clients.ts`, `lib/types.ts` — collect-all + tag-by-source,
  `metricsBySource`, Beszel detail, type additions.
- `lib/integrations/registry.ts` / `components/views/Home.tsx` — deprecated-type migration on load.

## Testing per phase

- Unit: `capabilities.sourceOptions()` (Auto + only-configured); snapshot collect-all tagging; the
  dashboards deprecated-type migration normalizer.
- Component: `CardSettingsModal` source select from configured services; a source-filtered panel
  shows only the chosen provider's items; merged Indexers/Books switch source; each new widget
  renders data + a graceful empty state.
- Gates: `lint && typecheck && test:coverage && build`.

## Rollout

Ship Phase 0+1 first (foundation, no visible change), then 2, 3, 4 as separate PRs.
