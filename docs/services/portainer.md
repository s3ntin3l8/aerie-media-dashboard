# Portainer — container restart (admin-only)

[Portainer](https://www.portainer.io/) powers an **admin-only** "restart container" control: when a
service looks stuck or unhealthy in **System Status**, an admin can bounce its container from inside
AERIE instead of SSHing to the host or opening Portainer.

| Surfaces | Secret |
|---|---|
| per-service **restart** button on each row in **System Status** (admin only) | Portainer **access token** (`X-API-Key`) |

AERIE talks to Portainer's API with a stored access token and uses Portainer's proxied Docker Engine
endpoint — it **never mounts the Docker socket** (`/var/run/docker.sock`) and gains no host-level
control beyond what the token allows. This is the safer of the two routes sketched in
[issue #41](https://github.com/s3ntin3l8/aerie/issues/41); the docker-socket route is intentionally
**not** implemented.

Like every mutation in AERIE, the restart is a `requireAdmin()`-guarded **server action** (never a
client-reachable route), and admin is re-checked server-side — the hidden button is defence in depth,
not the gate.

## Setup

1. **Mint a Portainer access token.** In Portainer: **Settings → My account → Access tokens → Add
   access token**. Use an account that can manage the target environments. Copy the token (`ptr_…`).
2. **Admin → Services → Add service**, type **Portainer** (preset → infra category, `portainer`
   logo). Set **Host** (and an **internal/LAN URL** if the API should bypass the public proxy), and
   paste the token in the **API token** field. There can be **one** Portainer instance; it may manage
   many environments (endpoints) via Portainer agents.
3. Once an **active** Portainer service with a stored token exists, two optional fields appear in the
   service add/edit modal for **every** service:
   - **Container name** — the Docker container to restart (e.g. `jellyfin`). A container **name** is
     used (not a volatile id), so it survives image pulls / recreations.
   - **Endpoint id** — the Portainer environment id the container lives on. Leave it **blank** to
     auto-resolve when the instance manages exactly one environment; set it when you run several
     agent-connected environments.

Set a service's **Container name** and the **restart** button appears on its **System Status** row
(admins only). Find the endpoint id in Portainer (the environment's URL contains
`…/endpoints/<id>/…`) or via `GET /api/endpoints` with your token.

## How it works

The restart action resolves the single configured Portainer instance (an active service carrying the
`portainer` logo with a stored token), the target service's container name and endpoint, then calls:

```
POST /api/endpoints/{endpointId}/docker/containers/{containerName}/restart   (X-API-Key: <token>)
```

The button uses a **two-click confirm** (click → *Confirm*/*Cancel*) and disables while the restart
is in flight, then shows a toast and refreshes the snapshot. Docker returns `204 No Content` on
success.

## Notes

- **Admin-only.** Non-admins never receive the container name / endpoint / `canRestart` fields in the
  snapshot (member snapshots are allowlist-scrubbed) and never see the button.
- **Real-data-or-empty.** No Portainer token stored → the container fields are hidden and no service
  is restartable. Container name unset → that service has no restart button.
- **Security.** Mounting the Docker socket would grant host-level control; the token route avoids it.
  Scope the Portainer token to only the environments you intend to manage.
- Self-signed LAN Portainer: enable **Allow self-signed TLS** on the service.
