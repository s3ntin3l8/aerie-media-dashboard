# Plex — maintenance actions (admin-only)

Plex is otherwise **monitor-only** in AERIE (panel data comes via Tautulli — see
[media-servers.md](media-servers.md)). The **Plex Maintenance** tab under **Admin** is the one
place that talks to Plex's own API to *trigger* work: library scans, metadata refresh, analyze,
trash/bundle/database housekeeping, and the scheduled **butler** tasks (including intro/credit
marker generation where the server has Plex Pass).

The tab only appears once a Plex token is stored, and the route + every action is admin-guarded.

## The token must be the server **owner's** `X-Plex-Token`

Maintenance actions are owner-only — a managed/home/shared token returns **401**. Store the owner
token as the Plex **API key** in **Admin → Services → Plex** (encrypted at rest, AES-256-GCM,
never sent to the browser). To obtain it:

- In Plex Web, open any item → **⋯ → Get Info → View XML**, and copy the `X-Plex-Token=…` value
  from the URL, **or**
- read the `PlexOnlineToken` attribute from the server's `Preferences.xml`
  (Linux: `…/Plex Media Server/Preferences.xml`).

See Plex's article *"Finding an authentication token / X-Plex-Token"* for the canonical steps.

## What the panel does

- **Libraries** — per library: **Scan** (`GET /library/sections/{id}/refresh`), **Refresh metadata**
  (`…?force=1`), **Analyze** (`PUT …/analyze`), **Empty trash** (`PUT …/emptyTrash`).
- **Server housekeeping** — **Clean bundles** (`PUT /library/clean/bundles?async=1`),
  **Optimize database** (`PUT /library/optimize?async=1`), **Empty all trash** (per library).
- **Scheduled tasks** — listed live from `GET /butler`; **Run now** posts `POST /butler/{name}`.
  Intro/credit detection, deep analysis and loudness tasks **require Plex Pass** and only appear in
  this list when the server supports them — AERIE never hardcodes task names.

Actions are **fire-and-forget**: Plex returns `200` with an empty body and works asynchronously, so
buttons report "started" (not "done"). Use **Refresh** to re-read a library's `refreshing` state.

> Tip: set the Plex **internal URL** to a LAN address (e.g. `http://host:32400`) so these calls
> bypass the public proxy — see [`../EMBEDDING.md`](../EMBEDDING.md).
