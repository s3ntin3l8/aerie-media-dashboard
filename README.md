# AERIE — Media Command Center

[![CI](https://github.com/s3ntin3l8/media-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/s3ntin3l8/media-dashboard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](./LICENSE)

A private media portal for self-hosted services (Plex, Jellyfin, Overseerr, the
*arr suite, Tautulli/Jellystat, Gatus, Prometheus), exposed behind Traefik and
authenticated through Authentik (OIDC). One vantage point to reach every service,
see unified media stats, manage per-user requests, and watch uptime.

Built with **Next.js (App Router, TypeScript)**, faithfully recreating the AERIE
design (see `design/`).

## Status

**All plan milestones implemented.** The app runs today on mock data with zero
config (dev mode), and switches to real services + OIDC purely via env + stored
secrets — no code changes.

| Area | State |
|---|---|
| Frontend | Pixel-faithful AERIE recreation; dark/light, ⌘K palette, keyboard nav, admin/member preview, responsive |
| Auth | Auth.js v5 ↔ Authentik OIDC; role from `groups` claim (`admins`→admin); route protection; dev bypass |
| Persistence | SQLite + Drizzle (services, secrets, groups, visibility, users, links, prefs); migrations + seed |
| Secrets | AES-256-GCM at rest (`ENCRYPTION_KEY`) |
| Integrations | Gatus, Tautulli, Jellyfin, Overseerr, Sonarr/Radarr, Prometheus clients; `Promise.allSettled` facade with per-panel mock fallback |
| Live data | `/api/snapshot` polled by the client; now-playing/status stay fresh |
| Cover art | Tautulli/Jellyfin proxy (`/api/artwork`) with placeholder fallback |
| Embedding | Real `<iframe>` + Traefik `frame-ancestors` middleware + Authentik forward-auth (`docs/EMBEDDING.md`) |
| Admin | Functional, persisted visibility matrix; `setServiceSecret`/`upsertService` server actions |
| Deploy | Standalone Dockerfile + `docker-compose.yml` behind Traefik; `.env.example` |

**Remaining (flagged — beyond the exported design, need a small forms/UX pass):**
add/edit-service modal & API-key entry UI (server actions already exist; the
design's Admin buttons are non-functional placeholders), DB-mirrored members +
Tautulli library-stat wiring, and the live **embedding spike** on your infra
(`docs/EMBEDDING.md`).

## Configure for production

1. `cp .env.example .env` and fill in Authentik OIDC creds, `AUTH_SECRET`, `ENCRYPTION_KEY`.
2. `npm run db:migrate && npm run db:seed` (or let the runtime bootstrap do it).
3. Enter each service's API key in **Admin → Services** (stored encrypted) to light
   up live data; services without a key keep showing mock/placeholder data.
4. Deploy with `docker compose up -d` behind Traefik; apply the embed +
   forward-auth middlewares to embeddable services (see `docs/EMBEDDING.md`).

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
  login/               Authentik OIDC handoff (mock)
components/
  primitives.tsx       Icon, Btn, Pill, Heartbeat, Sparkline, PosterTile, …
  panels.tsx           NowPlaying, ServiceTiles, CentralServices, Status, …
  portal/              PortalProvider (theme/role/palette), Rail, CommandPalette
  views/               Home, Launcher, Requests, Status, Admin, Login, shared
lib/
  types.ts             domain types
  mock/data.ts         mock data (ported from the design prototype)
styles/                colors_and_type.css · components.css · fonts.css + fonts
design/                source design bundle (prototype, chats, screenshots)
```

## Design fidelity

Components are ported from the design prototype with identical dimensions, colors,
and the verbatim token system. Compare against `design/screenshots/` —
`01-light-home.png`, `01-home-dark-admin.png`, `status.png`, `embed.png`,
`requests.png`, `02-services.png`, `login.png`.

The design-time "Tweaks" panel was intentionally dropped; the committed defaults
are locked (dark theme, command layout, spotlight central, stripe tiles, heartbeat
status viz).

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
