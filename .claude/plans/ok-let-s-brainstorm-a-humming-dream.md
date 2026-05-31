# AERIE — Media Portal · Design & Implementation Plan

## Context

The user self-hosts media services (Plex, Jellyfin, Overseerr, Sonarr, Radarr, …)
shared with a small group of close friends (<20 users), exposed to the internet
behind Traefik. They want a single **portal** — Organizr-v2 in spirit — to reach
every service in one place, see unified media stats, give each friend a per-user
request view, show a rich uptime dashboard, and carry custom branding. Auth is
delegated to **Authentik** (already running); the user (admin) sees and manages
more than normal users. Built partly to learn **Next.js**.

After brainstorming, the user exported a **finished, pixel-detailed design** from
Claude Design — **"AERIE — Media Command Center"** — and asked us to **faithfully
recreate it**, flagging deviations for review. The design bundle (HTML/CSS/JS
prototype + 3 design-session transcripts + screenshots) is the authoritative
visual reference. It realizes exactly the architecture we brainstormed.

**This plan = recreate the AERIE design faithfully in Next.js, backed first by
ported mock data (fast fidelity check), then wired to real services.**

### Design bundle location (read-only reference)
- Extracted: `/tmp/design_extract/dashboard/` (prototype `project/`, `chats/`, `screenshots/`)
- Durable copy of the gzip: under `.claude/projects/.../tool-results/webfetch-*.bin`
- Implementation must **copy the design-system assets verbatim** into the repo:
  `project/assets/{colors_and_type.css, components.css, fonts.css}` and
  `project/assets/fonts/*.woff2`.

### Decisions locked (brainstorm + design review)
| Area | Decision |
|---|---|
| Identity | Authentik at **`https://authentik.s3ntin3l8.de`** → portal is an **OIDC client** (Auth.js v5). Admin = Authentik group **`admins`**; everyone else = `user`. Sources: Google now, **Plex to be added** (email seed must work with both). |
| Portal URL | **`https://media.s3ntin3l8.de`** (this is the `frame-ancestors` value + forward-auth host) |
| Stack | **Next.js (App Router, TypeScript)** + React |
| Persistence | **SQLite** + **Drizzle ORM** (`better-sqlite3`) |
| Service access | **Hybrid**: iframe-embed (`embeddable`) services; launch-tile for the rest; native API panels on dashboard |
| Monitoring | **Gatus** JSON API (status) + **Prometheus** PromQL (admin metric cards) |
| Media stats | **Tautulli** (Plex) + **Jellystat** (Jellyfin); Overseerr (requests); *arr (queues) |
| Admin scope | Services/secrets CRUD, group→service visibility, all-users activity, full metrics, member mgmt |
| Cover art | **Wire real posters** from **Plex / Jellyfin / Tautulli / Overseerr** artwork APIs (server-side proxied/cached). **No TMDB.** |
| Mobile | **Responsive from the start** — every component adapts; the prototype is desktop-only and must be extended |
| Brand | Keep **AERIE** but make name/logo/hosts **configurable** (no hardcoded host names) |

### Deviations from the prototype (flagged — please review at approval)
1. **Tech:** prototype is in-browser React UMD + Babel; we rebuild in **Next.js/React** components. Visual output matched 1:1; internal structure need not match.
2. **Drop the design-time Tweaks panel.** Its layout/tile/status-viz *variants* were exploration aids. We **lock the committed defaults**: theme **dark** (light toggle kept), layout **command**, central **spotlight**, tiles **stripe**, status viz **heartbeat**. (Variants can return later as real user prefs if wanted.)
3. **Role is real, not a toggle.** Derived from Authentik groups. We keep an **admin-only "preview as member"** switch (cheap, genuinely useful) mirroring the prototype's `view` toggle.
4. **Mock → real data.** All `window.SERVICES/NOW_PLAYING/REQUESTS/USERS/...` become real API-fed data via the integrations layer.
5. **No client-side fake auth.** Drop the prototype's `localStorage` `authed`/route persistence; auth is a server session.
6. **Self-host all fonts** (prototype CDN-loads Material Symbols + JetBrains Mono) — this is a private, possibly-offline portal.

## Architecture Overview

A single Next.js app behind the existing Traefik, talking to a local SQLite file
and out to media/monitoring services. All third-party credentials stay server-side.

```
Browser ──HTTPS──> Traefik ──> Next.js portal ──> SQLite (config, links, prefs)
   │                  │             │
   │  (forward-auth)  │             ├─> Tautulli / Jellystat   (stats, now-playing)
   └── Authentik <────┘             ├─> Overseerr  ├─> Sonarr/Radarr (queues)
        (OIDC)                      ├─> Plex/Jellyfin ├─> Gatus ├─> Prometheus
                                    └─> TMDB / Plex / Jellyfin artwork (posters)
```

### ⚠️ Embedding is the #1 risk — spike it first
The whole embed UX rests on one constraint — satisfied here: **all services live
under `*.s3ntin3l8.de`** (portal at `media.s3ntin3l8.de`, services like
`radarr.s3ntin3l8.de`).
- **Same registrable domain (`s3ntin3l8.de`) ⇒ same-site:** `SameSite=Lax` Authentik
  cookies flow into the `<iframe>`, and Traefik forward-auth authenticates the framed
  request. ✓ Met. (Only `plex.tv` and any externally-hosted service are third-party →
  launch-only.)
- **Traefik headers middleware** replaces framing policy on embeddable routes with
  `Content-Security-Policy: frame-ancestors https://portal.<domain>` (do **not**
  blanket-delete `X-Frame-Options`). Plex (`plex.tv`) and any externally hosted
  service are launch-only by definition.
- **Safari ITP** is a residual risk even same-site. → **First implementation task
  is a spike:** iframe one real *arr behind Traefik+forward-auth, load in Safari +
  Chrome, confirm session flows. Decide the real embed/launch split before building
  `ServiceView` around it. (The launch-tile fallback already exists, so failure is graceful.)

### Components
1. **Auth (Auth.js v5 + Authentik OIDC).** PKCE; encrypted session. **Groups-claim
   gotcha:** `groups` isn't a default OIDC scope — needs an Authentik scope mapping
   emitting `groups`, the scope requested in provider config, and read in the
   `jwt`/`session` callbacks. Role mapping is config-driven: Authentik group
   **`admins`** → `admin`, all others → `user`. `middleware.ts` protects all routes;
   admin routes re-checked in handlers.
2. **Identity linking (genuinely hard — keep this).** Per-user requests/stats key on
   *upstream* user IDs, **not email**: Tautulli→Plex `user_id`, Jellystat→Jellyfin id,
   Overseerr→its own id. `account_links` table maps `portal_user → {plex,jellyfin,
   overseerr,tautulli}` ids; seeded by best-effort email match (works for both the
   **Google** and the soon-to-be-added **Plex** Authentik sources), then admin-editable +
   user-confirmable. Unlinked accounts degrade gracefully (the design already has the
   amber "Link account →" guard and the `linked` flag on member cards).
3. **Integrations (`/lib/integrations/*`).** One typed, server-only client per upstream
   (tautulli, jellystat, overseerr, sonarr, radarr, plex, jellyfin, gatus, prometheus,
   artwork). Per-call timeout; typed errors. Dashboard fans out with
   `Promise.allSettled` — one dead upstream degrades only its panel. Short-TTL cache
   only (Tautulli/Jellystat already retain history — read, don't duplicate).
4. **Now-playing refresh:** poll Tautulli/Plex (and Jellyfin) sessions on an interval
   (~5–10s) via a route handler; the advancing progress bar is client-side animation
   seeded by each poll (matches prototype's `useTick`).
5. **Artwork:** server-side route that resolves a poster from **Plex / Jellyfin /
   Tautulli / Overseerr** metadata (no TMDB) and proxies+caches it (avoids leaking
   tokens / mixed-content). `PosterTile` renders the image with the tinted block as the
   loading/fallback state.
6. **Persistence (SQLite + Drizzle).** Tables: `services`, `service_secrets`
   (AES-256-GCM encrypted — the design shows the "AES-GCM" badge), `tiles`/ordering,
   `groups` + `service_visibility` (group→service, drives the Admin toggle matrix),
   `users` (mirrored from Authentik), `account_links`, `preferences` (theme, favorites).
7. **Embedding** — Traefik middleware (above); `ServiceView` renders the real `<iframe>`
   with the forward-auth chrome bar; launch screen for non-embeddable.
8. **Deployment.** Multi-stage `Dockerfile` (`output: 'standalone'`); `docker-compose.yml`
   behind Traefik with SQLite volume, embed middleware, forward-auth; `.env.example`.

## Frontend — faithful recreation (the core deliverable)

**Port the token system verbatim**, then rebuild each component to match the
prototype's exact dimensions/colors, made responsive.

- **Design tokens / CSS:** copy `colors_and_type.css` (MD3-derived light+dark token
  set; dark = deep navy + electric cyan-mint `--primary:#57f1db`; light default token
  set), `components.css` (`.btn*`, `.pill`, `.chip`, `.kbd`, `.card/.panel`, `.input`,
  scrollbar, animations), `fonts.css` (Inter body / Manrope headline / JetBrains Mono /
  Material Symbols — self-hosted). Keep `.dark` on `<html>`, animations `aeriePulse`,
  `aerieEq`, `aerieSpin`.
- **Primitives** (`primitives.jsx` → components): `Icon`, `Btn`, `Pill`, `Chip`,
  `Eyebrow`, `Divider`, `Kbd`, `HealthDots`, `StatusDot`, `Heartbeat`, `Sparkline`,
  `Equalizer`, `ProgressBar`, `PosterTile` (now image-backed), `CatBadge`, `Avatar`,
  `SearchField`, `RailTip`. Category accent system: stream→primary, request→blue,
  automation→amber, monitor→green, infra→slate, down→error.
- **Shell:** 56px left **Rail** (BrandBadge + nav + role/theme/search controls,
  admin-only Admin item, badges), routing, **CommandPalette** (⌘K), keyboard shortcuts
  (`g h/s/r/u/a`, ⌘K, ⌘D).
- **Screens (match the bundled screenshots):**
  - **Login** (`login.png`) — Authentik OIDC handoff, split brand panel, "Continue with
    Authentik", OIDC·PKCE, "what happens next" steps.
  - **Home** (`01-light-home.png`, `01-home-dark-admin.png`) — GreetingHeader,
    40px HealthTicker (sparkline), **CentralServices spotlight** (big Plex/Jellyfin/
    Requests cards w/ 30-day uptime + heartbeat strip + real launch links), LibraryStats,
    NowPlaying (live), ServiceTiles (**stripe**), MyRequests (+ quota), StatusPanel
    (**heartbeat**), RecentlyAdded, admin QueuePanel. **command** layout (main + 360px rail).
  - **Services launcher** + **ServiceView** (`embed.png`) — category groups, embed/launch
    badges; real iframe + forward-auth chrome / launch screen.
  - **Requests** (`requests.png`) — per-user Overseerr (quota, filters, statuses) vs admin
    (approve/decline, all members); unlinked-account guard.
  - **Status** (`status.png`) — Gatus health list w/ heartbeats + stat tiles; admin-only
    Prometheus MetricCards (sparklines).
  - **Admin** (`02-services.png`) — 3 tabs: Services & Secrets (AES-GCM), Members
    (groups, linked state, quota), Visibility (group→service toggle matrix).
- **Role-aware RBAC (already in design):** members hide infra/Prometheus, see only their
  own session + own requests, no Admin chrome.

## Security
- Upstream secrets server-only; never serialized to client props.
- `service_secrets` encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY` from env).
- CSRF on mutating handlers/actions; admin guard in middleware **and** handlers.
- Iframe scoped via `frame-ancestors`, never blanket header removal.

## Critical Files (to create)
- `app/` App Router: `app/(portal)/page.tsx` (Home), `app/(portal)/services/page.tsx`,
  `app/(portal)/s/[service]/page.tsx` (embed/launch), `app/(portal)/requests`,
  `app/(portal)/status`, `app/admin/*`, `app/login`.
- `auth.ts` + `middleware.ts` — Auth.js v5 (Authentik provider, groups→role).
- `components/` — primitives + Rail + panels + CommandPalette (ported from prototype).
- `app/globals.css` + copied `assets/*.css` + self-hosted `assets/fonts/*`.
- `lib/integrations/{tautulli,jellystat,overseerr,sonarr,radarr,plex,jellyfin,gatus,prometheus,artwork}.ts`
- `lib/db/{schema.ts,client.ts}`, `drizzle.config.ts`; `lib/crypto.ts`; `lib/identity.ts`.
- `lib/mock/` — data ported from prototype `data.jsx` (drives the mock-first phase).
- `Dockerfile`, `docker-compose.yml`, `.env.example`, `traefik/` middleware snippets.

## Build Order (front-load fidelity; spike the risk)
0. **Init repo** — `git init` in `/home/bjoern/projects/dashboard`, scaffold Next.js, first commit.
1. **Embedding spike** — one real *arr in an iframe behind Traefik+forward-auth at `media.s3ntin3l8.de`, Safari+Chrome. Decide embed/launch split.
2. **Pixel-faithful frontend on mock data (first reviewable checkpoint).** Next.js scaffold; copy tokens/fonts; build primitives + all screens against ported mock data; **responsive**. Verify by diffing against bundled screenshots. Auth changes zero pixels, so this validates "faithful recreation" fastest.
3. **Auth + RBAC.** Auth.js↔Authentik (groups scope mapping + role), `middleware.ts`, real Login handoff, admin "preview as member".
4. **Real integrations + DB.** SQLite/Drizzle; integration clients replace mock data panel-by-panel (`Promise.allSettled`); now-playing polling; **real cover art** proxy; Gatus/Prometheus; Overseerr per-user (via `account_links`).
5. **Admin depth + deploy.** Services/secrets CRUD, visibility matrix, member mgmt; Dockerfile + compose behind Traefik.

## Verification
- **Fidelity:** run the app and **diff each screen against the bundled screenshots**
  (`login/status/embed/requests/02-services/01-home-dark-admin/01-light-home.png`);
  toggle dark/light; check the committed-default layout (command/spotlight/stripe/heartbeat).
- **Responsive:** verify each screen at mobile/tablet/desktop widths (rail collapse, column stacking).
- **Embedding:** embeddable service loads in iframe (Safari+Chrome); non-embeddable shows launch screen; verify `frame-ancestors` via curl.
- **Auth/RBAC:** admin-group member → admin; normal → user; member hides infra + sees only own session/requests; unauthenticated redirects.
- **Identity linking:** email seed + manual admin override → correct per-user Overseerr/Tautulli/Jellystat data.
- **Resilience:** stop one upstream → only its panel errors.
- **Cover art:** real posters render for now-playing/requests/recently-added with placeholder fallback.
- Unit-test integration clients vs fixtures; a couple of Playwright happy-path E2E flows (login → dashboard → open a service).

## Resolved config (from user)
- Authentik: `https://authentik.s3ntin3l8.de` · admin group **`admins`** · sources Google (now) + Plex (to add).
- Portal: `https://media.s3ntin3l8.de` (= `frame-ancestors` + forward-auth host).
- Shared registrable domain: **`s3ntin3l8.de`** — embedding works for all `*.s3ntin3l8.de` services. ✓
- Brand: keep **AERIE** (configurable). Posters: Plex/Jellyfin/Tautulli/Overseerr (no TMDB).

## Still to gather during build
- Per-service base URLs + API keys/tokens (entered via Admin UI or `.env`, encrypted at rest).
- Exact Gatus endpoint + Prometheus base URL for the status/metrics panels.
