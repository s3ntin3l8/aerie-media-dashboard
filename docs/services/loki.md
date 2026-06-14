# Loki — per-service log debugging (admin-only)

[Loki](https://grafana.com/oss/loki/) (Grafana's log aggregator) powers an **admin-only, read-only**
log viewer: open **Admin → Services → Logs** on any service to see its recent log tail in-portal
instead of shelling into the host for `docker logs`.

| Surfaces | Secret |
|---|---|
| per-service recent log tail (Admin → Services → **Logs** button) | Bearer token *or* `user:password` (both **optional**) |

Unlike most integrations, Loki does **not** drive a panel and does **not** ride the 12s snapshot
poll. Each service's tail is fetched **on-demand** (with an optional auto-refresh while the viewer
is open) so it stays out of the polling budget. Logs can contain secrets/PII, so the viewer and its
API route (`/api/loki/logs`) are **admin-gated**.

## Setup

1. **Admin → Services → Add service**, type **Loki** (preset → monitor category, `receipt_long`
   icon, `loki` logo).
2. Set **Host** to your Loki address, and the **internal/LAN URL** to the Loki HTTP endpoint the
   server should call (e.g. `http://loki.lan:3100`) — this keeps the API off the public proxy.
3. **Auth (optional).** Loki's HTTP API often runs open on a trusted LAN. If yours needs auth, store
   the secret in the key field:
   - a single **Bearer token**, or
   - **`username:password`** → sent as HTTP Basic (split on the first `:`, same convention as
     NZBGet/Beszel).
   Leave it blank for an open Loki.

Once an **active** Loki service exists, a **Logs** button appears on every row in **Admin →
Services** (and the **Loki query** field appears in the service add/edit modal).

## Mapping a service to its log stream

Each service resolves a **LogQL selector**:

- The service's explicit **`lokiQuery`** field (Admin → Services → edit → *Loki query*), e.g.
  `{container="sonarr"}` or `{app="sonarr",namespace="media"}`.
- When blank, an **inferred default** of `{container="<service-id>"}`.

Set `lokiQuery` when the container/label name differs from the AERIE service id. The viewer runs a
read-only `GET /loki/api/v1/query_range` (`direction=backward`, last hour, newest-first) — there is
**no** write/delete against Loki.

## Notes

- Read-only and admin-only; a non-admin never sees the button and the API route returns `403`.
- A missing/unreachable Loki only blanks the log viewer — the rest of the dashboard is unaffected.
- Logs are never stored in AERIE's DB and never leave the server except to the requesting admin.
- Self-signed LAN Loki: enable **Allow self-signed TLS** on the service (skips cert verification).
