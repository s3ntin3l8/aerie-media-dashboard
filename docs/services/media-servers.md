# Media servers — Plex, Tautulli, Jellyfin/Emby, Audiobookshelf

AERIE reads live data from your media servers to drive the now-playing, library, and
recently-added panels. **Real-data-or-empty:** a service shows an empty state until its secret is
stored in **Admin → Services** (encrypted at rest); the server never calls an unconfigured upstream.

| Service | Surfaces | Secret |
|---|---|---|
| **Plex** (via Tautulli) | now-playing, libraries, plays, history | Plex token (optional) |
| **Tautulli** | Plex now-playing, library counts, 24h plays, stream history, top stats, users | API key |
| **Jellyfin / Emby** | now-playing, library counts, recently-added | API key |
| **Audiobookshelf** | now-playing (listening sessions) | API token (Bearer) |

## Plex + Tautulli

Plex's own API isn't used for panel data — **Tautulli** is the source for Plex now-playing, library
counts, plays, and stream history. Add **both** services:

- **Tautulli** — set **Host** to the Tautulli address and paste its **API key** (Tautulli →
  Settings → Web Interface → API key). For embedding behind forward-auth + a split internal API URL,
  see [`../EMBEDDING.md`](../EMBEDDING.md) (the worked example is Tautulli).
- **Plex** — the token is **optional** (Plex panels come via Tautulli; the only direct call is the
  unauthenticated `/identity` version probe). Add it as a service so it appears as a tile / gets a
  version badge. If you store a token it's used as `X-Plex-Token`. Plex is launch-only when on
  `plex.tv` (a different registrable domain — can't be embedded; see EMBEDDING.md).

## Jellyfin / Emby

Set **Host** and paste an **API key** (Jellyfin → Dashboard → API Keys). Emby is treated as
Jellyfin-compatible. Surfaces now-playing sessions, library counts, and recently-added items.

## Audiobookshelf

Set **Host** and paste an **API token** (ABS → Settings → Users → your user → API Token), sent as a
`Bearer` token. Surfaces active listening sessions in the now-playing feed.

## Now-playing in the embed header

When one of these services is open in its in-portal embed (`/s/<id>`), its active sessions also show
as a compact live chip in the service-view header (title + progress, ticking between polls). Nothing
shows when idle.

## Notes

- Cover art is proxied server-side via `/api/artwork` (stored credentials never reach the browser).
- Correlating these to a service id matters: now-playing rows carry a source (`plex` / `jellyfin` /
  `audiobookshelf`); the embed chip matches on the service **id** equalling that source.
