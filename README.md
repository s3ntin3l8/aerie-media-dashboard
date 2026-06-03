<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/aerie-logo-dark.svg">
    <img alt="AERIE" src="./docs/assets/aerie-logo-light.svg" width="300">
  </picture>
</p>

<p align="center"><em>Media Command Center — every service, one vantage point.</em></p>

<p align="center">
  <a href="https://github.com/s3ntin3l8/media-dashboard/actions/workflows/ci.yml"><img src="https://github.com/s3ntin3l8/media-dashboard/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-informational.svg" alt="License: MIT"></a>
</p>

A private media portal for self-hosted services (Plex, Jellyfin, Overseerr, the *arr suite,
Tautulli/Jellystat, Gatus, Prometheus), exposed behind Traefik and authenticated via **any
OIDC provider** (or a local admin account when OIDC is off). One vantage point to reach
every service, see unified media stats, manage per-user requests, and watch uptime.

Built with **Next.js (App Router, TypeScript)**.

## Status

| Area | State |
|---|---|
| Frontend | Dark/light, ⌘K palette, keyboard nav, admin/member preview, responsive |
| Auth | Auth.js v5; any OIDC provider or local credentials; role from `groups` claim or `AERIE_ADMIN_EMAILS`; route protection |
| Persistence | SQLite + Drizzle (services, secrets, groups, visibility, users, links, prefs); migrations + seed |
| Secrets | AES-256-GCM at rest (`ENCRYPTION_KEY`) |
| Integrations | Gatus, Tautulli, Jellyfin, Overseerr, Sonarr/Radarr, Prometheus clients; real-data-or-empty per panel |
| Live data | `/api/snapshot` polled by the client; now-playing/status stay fresh |
| Cover art | Tautulli/Jellyfin proxy (`/api/artwork`) with placeholder fallback |
| Embedding | Real `<iframe>` + Traefik `frame-ancestors` middleware + OIDC forward-auth (`docs/EMBEDDING.md`) |
| Admin | Add/edit/remove **service modal** (wired to `upsertService`/`setServiceSecret`/`deleteService`), persisted visibility matrix |
| Requests | **Request modal** (member discover→confirm→submit) + **review modal** (admin approve/decline); real Overseerr search/create/review when configured |
| Deploy | Standalone Dockerfile + `docker-compose.yml` behind Traefik; `.env.example` |

## Configure for production

1. `cp .env.example .env` and fill in OIDC provider creds (or leave `OIDC_*` unset for
   local-admin mode), `AUTH_SECRET`, `ENCRYPTION_KEY`.
2. `npm run db:migrate && npm run db:seed` (or let the runtime bootstrap do it).
3. Enter each service's API key in **Admin → Services** (stored encrypted) to light up live
   data; services without a key show an empty state until configured.
4. Deploy with `docker compose up -d` behind Traefik; apply the embed + forward-auth
   middlewares to embeddable services (see `docs/EMBEDDING.md`).

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build + typecheck + lint
npm run start    # serve the production build
```

## Layout

```
app/
  (portal)/            authenticated shell (rail + ⌘K palette)
    page.tsx           Home dashboard
    services/          service launcher
    s/[service]/       embed / launch service view
    requests/  status/  admin/
  login/               OIDC handoff or local-admin sign-in
components/
  primitives.tsx       Icon, Btn, Pill, Heartbeat, Sparkline, PosterTile, …
  panels.tsx           NowPlaying, ServiceTiles, CentralServices, Status, …
  portal/              PortalProvider (theme/role/palette), Rail, CommandPalette
  views/               Home, Launcher, Requests, Status, Admin, Login, shared
lib/
  types.ts             domain types
  categories.ts        static service category taxonomy
styles/                colors_and_type.css · components.css · fonts.css + fonts
```

## Contributing / quality gates

- **CI** (`.github/workflows/ci.yml`): lint → typecheck → build, plus a Docker
  image build, on every push and PR to `main`.
- **pre-commit** (Husky + lint-staged): `eslint --fix` on staged files.
- **pre-push** (Husky): `npm run typecheck && npm run lint && npm run build`.

```bash
npm install        # installs hooks via the prepare script
npm run lint
npm run typecheck
npm run build
```

## License

[MIT](./LICENSE) © 2026 Björn ([s3ntin3l8](https://github.com/s3ntin3l8))
