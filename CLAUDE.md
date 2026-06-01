# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**AERIE** (package name `aerie`) is a private media command-center portal for self-hosted
services (Plex, Jellyfin, Overseerr, the *arr suite, Tautulli/Jellystat, Gatus, Prometheus).
It's a Next.js 16 App Router app (React 19, TypeScript) that sits behind Traefik and
authenticates via **any OIDC provider** (or a local admin account when OIDC is off). It's a
faithful recreation of the design in `design/`.

Two principles drive the data path:
- **Real data only.** Panels show live upstream data, or a graceful **empty state** until that
  service's API key is stored in the DB — there is no mock fallback. (There used to be; it was
  removed. `lib/mock/data.ts` is gone; its static taxonomy lives in `lib/categories.ts`.)
- **Auth is always required.** Either real OIDC, or a local credentials account created via the
  first-run setup screen at `/login`. Both unlock real data the same way (per-service secrets).

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

### Real-data-or-empty (most important concept)

Almost every server-side data source has the same shape: try the real upstream, return an
**empty result** on any failure or missing config (no mock fallback). Two gates matter:

- **`authConfigured`** (`lib/env.ts`) — true only when the OIDC issuer + client id + secret are
  all set. Drives auth mode: real OIDC vs. local credentials (see Auth & session).
- **Per-service stored secret** — a service only makes a live network call once an API key is
  stored (encrypted) in the DB. No secret → that panel renders a graceful empty state. The
  server never touches the network for unconfigured services.

`lib/env.ts` is the single, typed, **server-only** source of env config. Missing values
degrade gracefully rather than throwing. Nothing in `env` is exposed to the client. Generic
OIDC config lives here too (`oidcProviderId/Name/Icon`, `oidcScopes`, `oidcGroupsClaim`,
`adminEmails`), with the legacy `AUTH_AUTHENTIK_*` names read as a fallback.

### Auth & session

- `auth.ts` — Auth.js v5 config. When `authConfigured`, a **provider-agnostic OIDC** provider is
  registered (`id`/`name`/`scopes`/groups-claim all from env). Otherwise a **Credentials**
  provider authenticates local accounts (password verified via `lib/auth/password.ts`, loaded by
  lazy import so DB code stays out of the edge bundle). Role = membership in `AERIE_ADMIN_GROUP`
  **or** email in `AERIE_ADMIN_EMAILS` → `admin`, else `user`. JWT strategy; role/groups are
  threaded through the `jwt` (from `profile` for OIDC, `user` for credentials) and `session`
  callbacks. The `groups` scope is non-default and may need an IdP scope mapping (see `docs/AUTH.md`).
- `app/login/` — `page.tsx` resolves the auth **mode** server-side (`oidc` | `credentials` |
  `setup`, the last when no local admin exists yet) and renders `components/views/Login.tsx`.
  `actions.ts` has `signInWithPassword` and `createInitialAdmin` (the latter guarded: only when
  `!authConfigured` and no admin exists). Registry helpers: `getUserByEmail`, `localAdminExists`,
  `createLocalAdmin`.
- `proxy.ts` — middleware route protection. Auth is **always** required: redirects
  unauthenticated requests to `/login` (except `/login` + `/api/auth`) and blocks non-admins from
  `/admin` (defence in depth; also re-checked in the page).
- `lib/session.ts` — `getSessionUser()` is the server-side entry point. Always reads the real
  session (OIDC or credentials), best-effort **mirrors** the user into the `users` table, and
  falls back to a guest only if (defensively) no session exists.

### Data flow: server snapshot → client polling

1. `lib/data/snapshot.ts` — `getSnapshot()` is the **data facade**. It aggregates every
   upstream into one `Snapshot` object. Each section is wrapped in `safe()` and returns an
   **empty array** on failure/missing config, so one dead upstream only degrades its own panel
   (which renders an empty state). Live calls only fire for services that have a stored secret.
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
  `getServiceSecret()` (decrypts), `isConfigured()`, visibility/groups/members helpers, plus the
  local-account helpers (`getUserByEmail`, `localAdminExists`, `createLocalAdmin`). Readers
  return empty results when the DB is unavailable.

### Persistence (`lib/db/`, Drizzle + libSQL/SQLite)

- `schema.ts` — stores **config only** (services, encrypted secrets, groups, visibility matrix,
  mirrored users, account links, prefs). Runtime health/stats are read live and **never**
  stored. Default DB is `file:./data/aerie.db` (gitignored).
- `client.ts` — Drizzle client + `schema` re-export. `bootstrap.ts` — lazy migrate, then apply
  the optional config file, then seed (`ensureDb()`, cached per process). `seed.ts` — seeds only
  the minimal structural defaults (visibility groups, from `defaults.ts`); services and users
  come from the YAML config and the Admin UI, not a mock seed.
- Migrations live in `drizzle/` (generated SQL + meta). Edit `schema.ts`, then `db:generate`.

### Declarative config file (`lib/config/`, optional)

A third config source beside the mock seed and the Admin UI: a YAML file (default
`./config/aerie.yaml`, overridable via `AERIE_CONFIG_FILE`) can declare services, visibility
and secrets so a deployment is provisioned without clicking through the UI. `services.ts`
loads + validates it (zod) and resolves `${ENV_VAR}` secret references from `process.env`;
`apply.ts` reconciles it into the DB at bootstrap. It's **gap-fill only** — every insert uses
`onConflictDoNothing`, so existing rows (mock seed or UI edits) always win and the apply is
idempotent across reboots. A missing/malformed file degrades gracefully (logs a warning, never
throws). See `config/aerie.example.yaml`.

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
`cp .env.example .env` (OIDC creds **or** leave them blank for the first-run local-admin setup;
`AUTH_SECRET`, `ENCRYPTION_KEY`) → `db:migrate` (or rely on runtime bootstrap) → sign in (OIDC or
create the local admin at `/login`) → add services and enter each API key in **Admin → Services**
to light up live data → `docker compose up -d`. Auth details are in `docs/AUTH.md`; embedding/
forward-auth middleware in `docs/EMBEDDING.md`.
