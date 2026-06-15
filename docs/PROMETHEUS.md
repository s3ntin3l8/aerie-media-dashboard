# Prometheus

AERIE can connect to a Prometheus instance to embed it in the portal and query metrics from it.
Access is restricted to **admins** — Prometheus is hidden from all other visibility groups by default.

> **Prometheus or Beszel?** Prometheus and [Beszel](services/monitoring.md) are interchangeable
> sources for the System Status cards. Configure either, or both — when both are present a
> **Prometheus ⇄ Beszel toggle** appears in the section header, and the active choice persists as
> the `metricsSource` deployment setting. This page covers Prometheus; see
> [`services/monitoring.md`](services/monitoring.md) for Beszel.

## Prerequisites

- A running Prometheus server reachable from the AERIE container (e.g. `http://prometheus:9090`).
- Optional: a bearer token if your Prometheus is behind an auth proxy.
- Optional: set `PROMETHEUS_INSTANCE` (or the in-UI `prometheusInstance` setting) to filter
  node_exporter metrics to one host label, e.g. `pve` or `192.168.1.10:9100`.

## Adding Prometheus

### Option A — Declarative config (recommended)

Add the service to `config/aerie.yaml`:

```yaml
services:
  - id: prometheus
    name: Prometheus
    cat: monitor
    icon: query_stats
    host: metrics.example.com      # hostname the browser uses to reach Prometheus (for the iframe)
    embeddable: true
    note: "Metrics · admin"
    # Optional — only needed if Prometheus requires bearer auth.
    apiKey: ${PROMETHEUS_API_KEY}  # resolves from env at bootstrap
```

Then set the corresponding env var if you use bearer auth:

```env
PROMETHEUS_API_KEY=your-token-here
```

The declarative config is **gap-fill only**: it inserts the row if it doesn't already exist, and
never overwrites a row you've already configured through the Admin UI.

### Option B — Admin UI

1. Sign in as an admin and go to **Admin → Services**.
2. Create a new service with:
   - **ID**: `prometheus`
   - **Category**: `monitor`
   - **Host**: the hostname Prometheus is reachable at from the browser
3. After saving, open the service entry and paste in the API key (leave blank if Prometheus needs no auth).

## How it works

The integration lives in `lib/integrations/clients.ts`:

```
prometheusQuery(query: string) → Promise<number | null>
```

At call time it:

1. Reads the stored credentials from the DB via `getServiceCredentials("prometheus")`.
2. If no credentials are stored yet, throws `IntegrationError("prometheus", "not configured")` — the caller degrades gracefully to an empty state.
3. Calls `GET {baseUrl}/api/v1/query?query=<encoded>` with a 5 s timeout.
4. Returns the first result's scalar value, or `null` if the result set is empty.

The `apiKey` (bearer token) is encrypted at rest with AES-256-GCM keyed by `ENCRYPTION_KEY`.
It is never sent to the browser.

## Visibility

By default Prometheus is visible to **admins only**. To expose it to other groups, add a
visibility entry to your config file:

```yaml
visibility:
  - { serviceId: prometheus, groupName: friends, visible: true }
```

Or adjust it in **Admin → Visibility**.

## Writing custom metric queries

Anywhere on the server side you can call `prometheusQuery` with any valid PromQL instant query:

```ts
import { prometheusQuery } from "@/lib/integrations/clients";

const cpuIdle = await prometheusQuery('avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))');
```

The function returns a single `number` or `null`. Wrap calls in `safe()` (from
`lib/data/snapshot.ts`) so a Prometheus outage only degrades the panel that depends on it:

```ts
const cpuIdle = await safe(() =>
  prometheusQuery('avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))')
);
```

## Embedding Prometheus in the portal

If `embeddable: true` is set and the `host` field matches the Traefik hostname, the portal
renders Prometheus in an `<iframe>` via the `/s/prometheus` embed route. See
[`docs/EMBEDDING.md`](EMBEDDING.md) for the Traefik `frame-ancestors` config required to make
the iframe work.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Panel shows empty state / "not configured" | No API key stored in the DB yet — go to Admin → Services and enter the key (can be any non-empty string if Prometheus needs no auth). |
| `IntegrationError: 401` | Bearer token is wrong or expired. |
| `IntegrationError: timeout` | Prometheus is not reachable from the AERIE container — check network/firewall. |
| iframe shows blank / CSP error | `frame-ancestors` header is missing on the Prometheus side; see `docs/EMBEDDING.md`. |
| Metrics show stale values | Prometheus scrape interval — not an AERIE issue. |
