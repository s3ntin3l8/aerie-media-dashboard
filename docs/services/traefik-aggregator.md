# Traefik Dashboard Aggregator integration

[**traefik-dashboard-aggregator**](https://github.com/s3ntin3l8/traefik-dashboard-aggregator) is a
separate Go app that polls **every** Traefik node you run and serves a single pre-merged snapshot
at **`GET /api/snapshot`**. AERIE can read that one endpoint instead of scraping each Traefik
directly — same read-only route insight, one upstream call.

This is an **alternative source** for the exact same Traefik insight documented in
[`traefik.md`](traefik.md): per-service **route health**, the **SSO** (forward-auth) signal, and
**TLS-cert expiry**, all correlated to AERIE services **by host**. Nothing in the UI changes — the
same badges light up, just fed from the aggregator.

## When to use this instead of per-instance Traefik

- You run **more than one** Traefik and already have the aggregator deployed. AERIE makes **one**
  `/api/snapshot` call rather than `routers + services + metrics` per node.
- The aggregator reads each node's real `/api/certificates` (not the `/metrics` gauge), so cert
  expiry is available even when a node doesn't expose Prometheus metrics.
- The aggregator already resolves **Authentik** forward-auth, so the SSO signal is exact rather
  than the middleware-name heuristic the raw path falls back to.

AERIE **auto-detects** which kind each Traefik source is: for every active service with a `traefik`
or `traefik-aggregator` logo it probes `GET /api/snapshot`, and if that returns a valid merged
snapshot it reads the aggregator path, otherwise it falls back to scraping that source's raw Traefik
API. So the **logo is purely cosmetic** — you can give the aggregator the ordinary `traefik` logo
(there is no `traefik-aggregator` dashboard-icon) and it's still recognised correctly. Raw instances
and aggregators can even coexist; each is classified independently.

## Requirements

1. **The aggregator is running and reachable from the AERIE container.** It serves the merged
   snapshot at `/api/snapshot`. Verify: `curl http://<aggregator-host>/api/snapshot` returns JSON
   with `httpRouters` and `certificates` arrays.
2. **Host-based routing on your Traefik routers** — correlation is still by the hostname in each
   router rule (`` Host(`sonarr.example.com`) ``) matching the AERIE service's **Host** field.
3. **Reachable past forward-auth.** The aggregator ships with **no built-in auth** and is meant to
   sit behind a forward-auth proxy. AERIE's call is server-side, so point it at an **internal URL**
   that bypasses SSO (a Docker-network address or a LAN IP) — the same rule as every other
   integration (see [`../EMBEDDING.md`](../EMBEDDING.md)). A public, forward-auth-protected URL
   would bounce AERIE's request to the login page.

## Setup in AERIE

1. **Admin → Services → Add service.** Any name/logo works — the aggregator is detected by its
   `/api/snapshot` endpoint, not by name or logo (the `traefik` logo is a fine cosmetic choice). Set
   **Host** (and ideally the **internal URL**) to the aggregator address AERIE should reach
   server-side, e.g. `traefik-aggregator:8080` (Docker network) or its LAN IP.
2. **Mark it active.** No API key is needed — the aggregator has no auth.
3. **(Optional) basicAuth.** If you front the aggregator with HTTP basicAuth, put the credentials
   in the secret field as `username:password` (the preset hints this format). AERIE sends them as a
   `Basic` header. A secret without a `:` is ignored for auth.
4. **(Optional) self-signed TLS.** If you reach it over HTTPS with a self-signed cert, enable
   **Skip TLS verification** on the service (LAN hosts only).

Within ~12 s (the snapshot poll) the route badges appear on services whose host matches a router
in the aggregator snapshot — and the **"Discovered via Traefik"** panel populates from any host
the aggregator sees that has no matching AERIE service.

## Mapping (what AERIE reads from the snapshot)

| AERIE route field | Aggregator source |
|---|---|
| host(s) | the router `rule` (parsed) or its single `host` |
| route status | router `status` (the aggregator's `error` shows as `warning`) |
| backend health | router `serviceStatus` (`ok`→up, `degraded`→mixed, `down`→down) |
| behind SSO | the router's resolved `authentik`, else a forward-auth middleware name |
| TLS-cert expiry | matched from the snapshot's `certificates[]` (`domain` + `sans`, `notAfter`) |

## What the aggregator adds (beyond the raw Traefik path)

Because the aggregator's merged snapshot is richer than a single Traefik's API, AERIE surfaces a few
extras when it's the source — all **scoped to your configured services** so unrelated infra never
clutters the view:

- **Traefik nodes panel** (Admin, collapsed by default) — health/version/counts for each Traefik
  node, limited to **only the nodes that route at least one configured AERIE service**. A node that
  serves nothing in your stack never appears.
- **Serving node + middleware types** — each service's route tooltip names the Traefik node serving
  it and the resolved middleware *types* (e.g. `authentik (forwardauth)`), not just names.
- **Richer cert detail** — the cert chip/tooltip adds issuer, ACME resolver, and key type from the
  aggregator's `/api/certificates` (the raw path only has the expiry gauge).

## Scope & limitations

- Read-only; AERIE never writes to the aggregator or Traefik, and nothing is persisted.
- Correlation is **by host only** — same as the raw Traefik path.
- Node health is **scoped to configured services** by design (see above). Still out of scope: TCP/UDP
  routers, raw middleware config, and an unscoped full certificate inventory.

## Related

- [`traefik.md`](traefik.md) — the raw per-instance Traefik integration (the fallback source) and
  the full description of the route/SSO/cert badges this shares.
- [`../EMBEDDING.md`](../EMBEDDING.md) — internal URLs and forward-auth.
