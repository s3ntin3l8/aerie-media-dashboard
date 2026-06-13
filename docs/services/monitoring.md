# Monitoring & host metrics — Gatus, Prometheus, Beszel

These drive the **Status** view's service health and the **System Status** host-metric cards.

| Service | Surfaces | Secret |
|---|---|---|
| **Gatus** | per-service health, 30-point heartbeat, uptime %, latency, last incident | API key (optional) |
| **Prometheus** | host metric cards (CPU/mem/net/disk/load/uptime/filesystems) | bearer token (optional) |
| **Beszel** | the same host metric cards (alternative source) | `email:password` (superuser) |

## Gatus — service health

Set **Host** to the Gatus address. The API key is **optional** (only for a bearer-protected Gatus),
so Gatus is gated on the service being **active**, not on a stored secret. AERIE reads
`/api/v1/endpoints/statuses` and maps each endpoint to a service by **name/key** — so a Gatus
endpoint named like the AERIE service (or matched via the service's **monitoring key**) lights up its
heartbeat. Disabling the Gatus row stops **all** heartbeats portal-wide (intended "fully disable").

## Prometheus & Beszel — host metrics

Prometheus and Beszel are **interchangeable** sources for the System Status cards. When both are
configured a **Prometheus ⇄ Beszel toggle** appears (default Prometheus); the active source +
selected node/system persist as deployment settings (`metricsSource`, `prometheusInstance`,
`beszelSystem`).

- **Prometheus** — see the dedicated guide: [`../PROMETHEUS.md`](../PROMETHEUS.md). API key optional
  (bearer only); a node/instance picker scopes the query.
- **Beszel** — the hub is PocketBase, so it **needs** credentials. Store the secret as
  `email:password` for a Beszel **superuser** (split on the first `:`) — that reads every monitored
  system without per-system sharing. Create one with
  `docker exec beszel /beszel superuser upsert you@example.com 'password'`. AERIE caches the auth
  token in-process and re-auths on 401; a system picker chooses which host to display.

## Notes

- All read-only; a dead source only blanks the metric cards, not the rest of the dashboard.
- Prometheus/Beszel are admin-only by default (infra category) — share via the visibility matrix if
  needed.
