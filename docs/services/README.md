# Service integrations

Per-service setup for every upstream AERIE integrates with. Common rules apply to all:

- **Real-data-or-empty.** A service shows a graceful empty state until its secret is stored in
  **Admin → Services**; the server never calls an unconfigured upstream.
- **Secrets** are encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`) and **never** reach the browser.
- **Per-panel degradation.** A dead or misconfigured upstream only blanks its own widget.
- **Internal URLs.** Point server-side API calls at a LAN address via the service's **internal URL**
  so they bypass the public proxy — see [`../EMBEDDING.md`](../EMBEDDING.md).

| Doc | Services |
|---|---|
| [media-servers.md](media-servers.md) | Plex, Tautulli, Jellyfin/Emby, Audiobookshelf |
| [requests.md](requests.md) | Overseerr / Jellyseerr |
| [arr-suite.md](arr-suite.md) | Sonarr, Radarr, Lidarr, Readarr, Whisparr, Listenarr, LazyLibrarian, Prowlarr, NZBHydra2, Bazarr, Agregarr, Wizarr |
| [download-clients.md](download-clients.md) | NZBGet, qBittorrent |
| [monitoring.md](monitoring.md) | Gatus, Prometheus ([detail](../PROMETHEUS.md)), Beszel |
| [traefik.md](traefik.md) | Traefik (read-only route / SSO / TLS-cert insight) |
| [traefik-aggregator.md](traefik-aggregator.md) | Traefik Dashboard Aggregator (one `/api/snapshot` source for the same insight) |
| [authentik.md](authentik.md) | Authentik (read-only per-app group access) |

Related: [`../AUTH.md`](../AUTH.md) (signing in via OIDC / local admin) ·
[`../EMBEDDING.md`](../EMBEDDING.md) (iframe embedding + forward-auth) ·
[`../PROMETHEUS.md`](../PROMETHEUS.md).

Secret-format quick reference:

- **API key** (most): paste the upstream's key — *arr apps use Settings → General → API Key.
- **`username:password`** pair (one field, split on first `:`): NZBGet (optional), qBittorrent.
- **`email:password`** superuser pair: Beszel.
- **Optional / no key**: Gatus, Prometheus, NZBGet (auth disabled), Plex token, Traefik API
  (open or basicAuth).
- **Bearer token**: Audiobookshelf, Authentik (superuser API token).
