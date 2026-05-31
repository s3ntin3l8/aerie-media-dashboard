# AERIE — Media Command Center

A private media portal for self-hosted services (Plex, Jellyfin, Overseerr, the
*arr suite, Tautulli/Jellystat, Gatus, Prometheus), exposed behind Traefik and
authenticated through Authentik (OIDC). One vantage point to reach every service,
see unified media stats, manage per-user requests, and watch uptime.

Built with **Next.js (App Router, TypeScript)**, faithfully recreating the AERIE
design (see `design/`).

## Status

**Phase: pixel-faithful frontend on mock data** (Build Order step 2 of the plan).
All screens render against `lib/mock/data.ts`; real auth + integrations come next.

| Done | Next |
|---|---|
| Design-token CSS ported verbatim (`styles/`) | Auth.js ↔ Authentik OIDC + RBAC |
| All primitives + panels + views | Real integration clients (Tautulli, Overseerr, Gatus, …) |
| Routes: Home, Services, Service embed/launch, Requests, Status, Admin, Login | SQLite + Drizzle, encrypted secrets |
| Dark/light theme, ⌘K palette, keyboard nav, admin/member preview | Real cover art, now-playing polling |
| Responsive layout hooks | Traefik embed middleware + Docker deploy |

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
status viz). See `.claude/plans/` for the full plan and locked decisions.
