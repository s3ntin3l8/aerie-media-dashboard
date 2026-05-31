# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**AERIE** (package name `aerie`) is a private media command-center portal for self-hosted
services (Plex, Jellyfin, Overseerr, the *arr suite, Tautulli/Jellystat, Gatus, Prometheus).
It's a Next.js 16 App Router app (React 19, TypeScript) that sits behind Traefik and
authenticates via Authentik (OIDC). It's a faithful recreation of the design in `design/`.

The central design principle is **graceful degradation**: the app runs with zero config on
mock data, and lights up real data purely through env vars + secrets stored in the DB — no
code changes. Understand this before touching the data path.

## Commands

```bash
npm install         # also installs Husky git hooks via the "prepare" script
npm run dev         # dev server at http://localhost:3000 (mock mode, no config needed)
npm run build       # production build (this is what CI gates on)
npm run start       # serve the production build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run db:generate # drizzle-kit generate (new migration from schema.ts changes)
npm run db:migrate  # drizzle-kit migrate
npm run db:seed     # tsx scripts/seed.ts
```

There is **no test runner** in this project. The quality gates are `lint`, `typecheck`, and
`build`. Match those before considering work done.

Migrations normally don't need to be run by hand: `lib/db/bootstrap.ts` lazily applies them
and seeds from mock data on first DB use (`ensureDb()`), so a fresh deployment self-bootstraps.
Only run `db:generate` when you change `lib/db/schema.ts`.

## Quality gates (enforced, not optional)

- **CI** (`.github/workflows/ci.yml`): `lint → typecheck → build` plus a Docker image build,
  on every push/PR to `main`. Node 24.
- **pre-commit** (Husky + lint-staged): `eslint --fix` on staged `*.{ts,tsx,js,mjs}`.
- **pre-push** (Husky): the full `npm run typecheck && npm run lint && npm run build`. A push
  will be rejected locally if any of these fail.

## Architecture

### The dev-mode / real-mode duality (most important concept)

Almost every server-side data source has the same shape: try the real upstream, fall back to
mock on any failure or missing config. Two gates decide which mode a given concern is in:

- **`authConfigured`** (`lib/env.ts`) — true only when Authentik issuer + client id + secret
  are all set. Drives auth: real OIDC vs. a dev-mode mock admin user.
- **Per-service stored secret** — a service only makes a live network call once an API key is
  stored (encrypted) in the DB. No secret → that panel shows mock/placeholder data. This means
  the dev/mock server never touches the network.

`lib/env.ts` is the single, typed, **server-only** source of env config. Missing values
degrade gracefully rather than throwing. Nothing in `env` is exposed to the client.

### Auth & session

- `auth.ts` — Auth.js v5 config. The Authentik OIDC provider is only registered when
  `authConfigured`; otherwise `providers` is empty. Role is derived from the OIDC `groups`
  claim: membership in `AERIE_ADMIN_GROUP` (default `admins`) → `admin`, else `user`. JWT
  session strategy; role/groups are threaded through the `jwt` and `session` callbacks.
  The `groups` scope is non-default and requires an Authentik scope mapping.
- `proxy.ts` — middleware route protection. No-op when `!authConfigured`. Otherwise redirects
  unauthenticated requests to `/login` and blocks non-admins from `/admin` (defence in depth;
  also re-checked in the page).
- `lib/session.ts` — `getSessionUser()` is the server-side entry point. Returns a hardcoded
  dev admin (`Björn`) in mock mode; otherwise the real session user, and best-effort
  **mirrors** the user into the `users` table on each request.

### Data flow: server snapshot → client polling

1. `lib/data/snapshot.ts` — `getSnapshot()` is the **data facade**. It aggregates every
   upstream into one `Snapshot` object. Each section is wrapped in `safe()` and falls back to
   mock (`lib/mock/data.ts`) independently, so one dead upstream only degrades its own panel.
   Live calls only fire for services that have a stored secret.
2. `app/(portal)/layout.tsx` — server component; fetches `getSessionUser()` + `getSnapshot()`
   in parallel and seeds the client `DataProvider`. `dynamic = "force-dynamic"` (never
   prerendered).
3. `components/portal/DataProvider.tsx` — client; seeded with the server snapshot, then polls
   `/api/snapshot` every 12s (pauses when tab hidden). `useData()` reads it; `useRefresh()`
   forces an immediate refetch after a mutation.
4. `app/api/snapshot/route.ts` — re-runs `getSnapshot()` for the polling feed.

When adding a new data source: add a client in `lib/integrations/clients.ts`, wire it into
`getSnapshot()` behind a `has(serviceId)` secret check with a mock fallback, and surface it
on the `Snapshot` type.

### Integrations layer (`lib/integrations/`)

- `http.ts` — `fetchJson()`: every upstream call goes through this bounded-timeout (5s),
  `cache: "no-store"` fetch that throws a typed `IntegrationError`. Use it for all upstream
  HTTP so the facade can degrade per-panel.
- `clients.ts` — one normalizing function per upstream (Gatus, Tautulli, Jellyfin, Overseerr,
  Sonarr/Radarr, Prometheus). They **throw** on missing config/errors; the facade catches.
- `registry.ts` — bridges DB config ↔ runtime. `getServiceConfigs()`, `getServiceCredentials()`,
  `getServiceSecret()` (decrypts), `isConfigured()`, visibility/groups/members helpers. Every
  reader falls back to mock when the DB is unavailable.

### Persistence (`lib/db/`, Drizzle + libSQL/SQLite)

- `schema.ts` — stores **config only** (services, encrypted secrets, groups, visibility matrix,
  mirrored users, account links, prefs). Runtime health/stats are read live and **never**
  stored. Default DB is `file:./data/aerie.db` (gitignored).
- `client.ts` — Drizzle client + `schema` re-export. `bootstrap.ts` — lazy migrate+seed
  (`ensureDb()`, cached per process). `seed.ts` — seeds from mock data.
- Migrations live in `drizzle/` (generated SQL + meta). Edit `schema.ts`, then `db:generate`.

### Secrets (`lib/crypto.ts`)

Service API keys are encrypted at rest with **AES-256-GCM** keyed by `ENCRYPTION_KEY`
(32-byte hex/base64, or any string stretched via sha256). There's an insecure dev fallback key
so the app runs unconfigured. `encrypt()`/`decrypt()` produce/consume `{iv, authTag, ciphertext}`
stored in `service_secrets`.

### Frontend (`app/`, `components/`, `styles/`)

- Route group `app/(portal)/` is the authenticated shell. Pages are thin: each `page.tsx` just
  renders a view from `components/views/` (Home, Launcher, Requests, Status, Admin, Login).
  Real UI logic lives in the views and in `components/panels.tsx` / `components/primitives.tsx`.
- `app/(portal)/s/[service]/page.tsx` — embed/launch view for a service (real `<iframe>` via
  Traefik `frame-ancestors` + Authentik forward-auth; see `docs/EMBEDDING.md`).
- Client state: `components/portal/PortalProvider.tsx` (`usePortal()`) holds theme, the admin
  "preview as member" role toggle, the ⌘K command palette, and keyboard nav (`h/s/r/u/a`
  navigate). `DataProvider` holds live data. Keyboard shortcuts are suppressed while a modal
  is open (`modalOpen`).
- Mutations are **server actions**: `app/(portal)/admin/actions.ts` (`setServiceSecret`,
  `setVisibility`, `upsertService`, `deleteService` — all `requireAdmin()`-guarded, call
  `revalidatePath`) and `app/(portal)/actions.ts` (`signOutAction`). After a mutation, call
  `useRefresh()` client-side to pull a fresh snapshot.
- `app/api/artwork/route.ts` — server-side cover-art proxy; resolves upstream image URLs with
  stored credentials (never exposed to the client) and streams bytes back. Used by `PosterTile`.
- Styling is a **CSS token system** in `styles/` (`colors_and_type.css`, `components.css`,
  `fonts.css`), ported verbatim from the design. Components reuse these tokens/classes rather
  than ad-hoc styles — preserve dimensions/colors/tokens when porting from the design.

### Domain types

`lib/types.ts` is the shared domain vocabulary (`Service`, `NowPlaying`, `MediaRequest`,
`User`, `Category`, `ServiceStatus`, etc.). Reuse these; the facade and mock data both conform.

## Conventions

- **`import "server-only"`** sits at the top of every server-only module (`env`, `crypto`,
  `session`, the whole `lib/integrations` and `lib/db` layers, the data facade). Keep this when
  adding server modules; never import them into client components.
- Import alias is `@/*` → repo root (e.g. `@/lib/env`, `@/components/views/Home`).
- The locked design defaults (dark theme, command layout, spotlight central, stripe tiles,
  heartbeat status viz) are intentional — the design-time "Tweaks" panel was dropped. Compare
  visual work against `design/screenshots/`. The `design/` and `drizzle/` dirs are eslint-ignored.
- `react-hooks/set-state-in-effect` is intentionally a **warning**, not an error, for idiomatic
  mount-time effects (localStorage restore, interval ticks). Don't fight it.

## Deployment

Standalone `Dockerfile` + `docker-compose.yml` behind Traefik. Production setup:
`cp .env.example .env` (Authentik OIDC creds, `AUTH_SECRET`, `ENCRYPTION_KEY`) →
`db:migrate && db:seed` (or rely on runtime bootstrap) → enter each service's API key in
**Admin → Services** to light up live data → `docker compose up -d`. Embedding/forward-auth
middleware details are in `docs/EMBEDDING.md`.
