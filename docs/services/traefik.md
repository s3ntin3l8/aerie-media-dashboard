# Traefik integration

AERIE reads your **Traefik** reverse proxy's HTTP API to enrich each service with
read-only routing insight, correlated to the service **by host**:

- **Route health** — the router's status and backend `serverStatus` (UP/DOWN),
  distinct from the Gatus heartbeat. A service can be *up* but mis-routed (or
  vice-versa); this tells the two apart.
- **Protected by SSO** — whether the router's middleware chain contains a
  forward-auth middleware. Derived from Traefik alone, so it works regardless of
  your IdP (AERIE is provider-agnostic — this is *not* Authentik-specific).
- **TLS certificate expiry** — "cert expires in N days", color-coded (red < 3 days,
  amber < 14). Read best-effort from Traefik's `/metrics` endpoint.

It's **read-only** — AERIE never writes to Traefik, and none of this is persisted
(it's recomputed on each snapshot poll). When Traefik isn't configured, nothing
changes in the UI.

## Where it shows up

- **Status** view — each service row gains compact badges next to its host: an
  `SSO` shield (forward-auth), a `route` chip when the router/backend is unhealthy,
  and a `cert NNd` chip.
- **Admin → Services** — the same badges under each service (table and mobile card).
- **`GET /api/traefik/routes`** — an admin-only JSON endpoint returning the raw
  correlated routers (for debugging). The Status/Admin data is the source of truth;
  this just exposes it directly.

### Discovered routers (one-click add)

Traefik routers whose host matches **no** AERIE service are surfaced in **Admin → Services**
under a **"Discovered via Traefik"** panel — each with an **Add** button that opens the service
modal pre-filled with the host, scheme, and a guessed name/icon. It's admin-driven and additive
(no automatic writes); a suggestion **self-clears** once you add it (the host then matches a
service on the next poll).

## Requirements

1. **Traefik API enabled.** It is **off by default**. Enable it (and keep it
   private — behind your own auth, not exposed publicly):

   ```yaml
   # static config (traefik.yml) or CLI flags
   api:
     dashboard: true        # optional
     # insecure: true       # exposes the API on :8080 with NO auth — LAN-only, or prefer basicAuth below
   ```

   AERIE talks to the API endpoints `/api/http/routers` and `/api/http/services`.

2. **Metrics enabled (for cert expiry — optional).** Cert expiry comes from the
   Prometheus metric `traefik_tls_certs_not_after`, exposed at `/metrics` on the
   internal `traefik` entrypoint (usually the same host:port as the API):

   ```yaml
   metrics:
     prometheus:
       entryPoint: traefik
       addEntryPointsLabels: true
   ```

   If metrics are off or unreachable, routes still load — you just won't see the
   cert chip. No other functionality depends on `/metrics`.

3. **Host-based routing.** Routes correlate to AERIE services by the hostname in
   the router rule (e.g. `` Host(`sonarr.example.com`) ``) matching the service's
   **Host** field. Routers with no `Host(...)` (pure `PathPrefix`, etc.) are
   ignored. Wildcard certs (`*.example.com`) match one label deep.

## Setup in AERIE

1. **Admin → Services → Add service.** Type `Traefik` — the preset fills in the
   category/icon. Set **Host** to the Traefik API address AERIE should reach
   server-side, e.g. `traefik:8080` (Docker network) or `traefik.example.com`.
   Use the **internal URL** field for a LAN address if the public host isn't
   reachable from the container.
2. **Mark it active.** Unlike most services, Traefik needs **no API key** to read
   an open API — being active is enough.
3. **(Optional) basicAuth.** If you protect the Traefik API with HTTP basicAuth,
   put the credentials in the secret field as `username:password` (the preset hints
   this format). AERIE sends them as a `Basic` auth header. A secret without a `:`
   is ignored for auth.
4. **(Optional) self-signed TLS.** If the API is HTTPS with a self-signed cert,
   enable **Skip TLS verification** on the service (LAN hosts only).

Within ~12 s (the snapshot poll) the route badges appear on services whose host
matches a Traefik router.

## How the "behind SSO" signal works

A router is flagged `forwardAuth` when any middleware name in its chain matches
`auth` / `forward` / `authentik` (case-insensitive) — e.g. `authentik@docker`,
`forwardAuth-authentik@file`. This is a name heuristic, not a deep inspection of
the middleware type, so a forward-auth middleware named something exotic won't be
detected. Hover the `SSO` badge to see the full middleware list.

## Troubleshooting

- **No badges appear.** Confirm the Traefik service is **active** and its **Host**
  is reachable from the AERIE container: `curl http://<host>/api/http/routers`
  should return JSON. Check the router rule hostnames match the service **Host**
  exactly (case-insensitive).
- **Route badge but no cert chip.** Metrics are likely disabled or on a different
  entrypoint. Verify `curl http://<host>/metrics | grep traefik_tls_certs_not_after`
  returns lines. Self-signed cert hosts not fronted by Traefik will never get a chip
  (a direct TLS probe is a planned follow-up).
- **`SSO` missing on a protected service.** The forward-auth middleware name didn't
  match the heuristic — check the middleware list in the badge tooltip.

## Scope & limitations

- Read-only; no Traefik configuration is changed and nothing is stored in AERIE.
- Correlation is **by host only** — services without a host-based router, or whose
  host doesn't match the AERIE **Host** field, won't be enriched.
- Cert expiry depends on Traefik actually serving the cert (ACME or provided) and
  on metrics being enabled.

## Related / planned

- **Authentik app-access** (which groups can access each app) — a provider-specific
  follow-up; the SSO signal here is the provider-agnostic version.
- **Direct TLS probe** — a `tls.connect()` fallback for services not fronted by
  Traefik, or where metrics are disabled.
- Embedding & forward-auth setup: see [`docs/EMBEDDING.md`](../EMBEDDING.md).
