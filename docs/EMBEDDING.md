# Embedding services in AERIE

The portal embeds services in an `<iframe>` (the in-portal "Open" experience).
This only works when two conditions hold. **Validate them with the spike below
before relying on embedding.**

## Hard requirements

1. **Same registrable domain.** The portal and every embeddable service must
   share one eTLD+1 — e.g. `portal.example.com` (portal) + `radarr.example.com`
   (service) both under `example.com`. A service on a *different* registrable
   domain is third-party: the Authentik session cookie will **not** flow into the
   iframe and forward-auth will fail. Those services must stay launch-only
   (`embeddable: false`) — e.g. Plex (`plex.tv`).

2. **Framing allowed for the portal origin.** Most *arr apps / Jellyfin send
   `X-Frame-Options: SAMEORIGIN` or a restrictive CSP that blocks framing. Traefik
   must rewrite that on the embeddable routes (the origin below must match your
   `AERIE_PORTAL_URL`):

   ```
   # replaces the framing policy with one that allows the portal origin
   traefik.http.middlewares.aerie-embed.headers.contentSecurityPolicy=frame-ancestors https://portal.example.com
   traefik.http.middlewares.aerie-embed.headers.customResponseHeaders.X-Frame-Options=
   ```

   Attach `aerie-embed@docker` **and** `forwardAuth-authentik@file` (forward-auth) to each
   embeddable service's router. See `docker-compose.yml` for the labels.

## The spike (run before trusting embedding)

The decisive risk is **Safari ITP**, which can block cookies in third-party-ish
contexts even for same-site subdomains. Chrome is generally fine post-3PC-rollback.

1. Pick one real embeddable service (e.g. `radarr.example.com`) and apply both
   middlewares in Traefik.
2. Confirm the framing header is rewritten:
   ```
   curl -sI https://radarr.example.com | grep -iE 'content-security-policy|x-frame-options'
   # expect: content-security-policy: frame-ancestors https://portal.example.com
   # expect: no x-frame-options (or empty)
   ```
3. Sign into the portal, open the service tile → it should render in-frame
   **without** a second login.
4. **Test in both Safari and Chrome.** If Safari blocks the session inside the
   frame, flip that service to `embeddable: false` (launch-only) in the Admin UI —
   the launch-tile fallback already exists, so the failure is graceful.

## Per-service decision

- **Embeddable** (`embeddable: true`): same domain + framing rewritten + passes the
  spike → iframe.
- **Launch-only** (`embeddable: false`): external domain (Plex) or fails the spike
  → opens in a new tab; the user stays signed in via the service's own auth.

## Worked example: Tautulli (an app with no native SSO)

Tautulli has **no OIDC/SAML** — only a local login (its "sign in with Plex" is an optional
guest mode, not SSO). You still get single sign-on by gating it at the proxy with Authentik
forward-auth and letting Authentik inject HTTP Basic credentials. The same recipe applies to
any app without native SSO (the *arr suite, qBittorrent, etc.).

### 1. Traefik labels (publish only the UI)

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=proxy
  - traefik.http.routers.tautulli.rule=Host(`tautulli.example.com`)
  - traefik.http.routers.tautulli.entrypoints=websecure
  - traefik.http.routers.tautulli.tls.certresolver=le   # your cert resolver
  - traefik.http.routers.tautulli.middlewares=forwardAuth-authentik@file,aerie-embed@docker
  - traefik.http.services.tautulli.loadbalancer.server.port=8181
```

### 2. Authentik: Proxy Provider with HTTP Basic injection

Create a **Proxy Provider** (forward-auth, single application) + Application for
`tautulli.example.com`, assign it to the outpost, and bind the groups that may access it.
To make the in-frame login transparent (per the
[official guide](https://integrations.goauthentik.io/media/tautulli/)):

- On the provider, enable **"Send HTTP-Basic Authentication"** with
  **Username key** = `tautulli_user`, **Password key** = `tautulli_password`.
- Put portal users in a **"Tautulli users"** group and set those two values as **group
  attributes** (they become the Basic creds Authentik forwards).

> **Critical:** the `forwardAuth-authentik@file` middleware must forward the `Authorization`
> header back to the service. Add `Authorization` to its `authResponseHeaders` (alongside the
> usual `X-authentik-username, -groups, -email, -name, -uid`) — otherwise the injected Basic
> header never reaches Tautulli and the in-frame login reappears.

### 3. Tautulli `config.ini`

```ini
http_basic_auth = 1
http_hash_password = 0
http_hashed_password = 1
http_password = <your_password>   # must match the tautulli_password group attribute
```

Keep Tautulli's own login **enabled** (this is it) — it's the defense-in-depth backstop for
anyone who reaches the service directly on the LAN.

### 4. Register it in AERIE — with a split internal API URL

The portal calls Tautulli's API **server-side**. Don't route that through the public proxy
(it would expose the powerful API to the internet and put the `apikey` in proxy logs). Instead,
point AERIE at the service's **internal/LAN address** via `internalUrl`, while `host` stays the
public hostname used for the iframe:

```yaml
# config/aerie.yaml (or Admin → Services → "API base URL")
- id: tautulli
  name: Tautulli
  cat: monitor
  icon: monitoring
  host: tautulli.example.com               # public → iframe embed (HTTPS, behind forward-auth)
  internalUrl: http://<service-lan-ip>:8181  # LAN → server-side API calls
  embeddable: true
  apiKey: ${TAUTULLI_API_KEY}
```

`internalUrl` is resolved in `getServiceCredentials` (`internalUrl || baseUrl`), so **all**
server-side API traffic uses the LAN address while the iframe keeps the public HTTPS URL.

> **Why `internalUrl` and not `baseUrl`:** AERIE derives the iframe scheme from `baseUrl`
> (`lib/data/snapshot.ts`). Putting an `http://` LAN address in `baseUrl` would make the iframe
> load `http://tautulli.example.com` → **mixed content, blocked** inside the HTTPS portal.
> Keep the LAN URL in `internalUrl`; leave `baseUrl`/`host` as the public identity.

### Security notes

- **Don't expose the API to the internet.** Forward only `443 → Traefik` at the router; do
  **not** port-forward `:8181`. Since AERIE and Tautulli are on different hosts, add a host
  firewall rule on the Tautulli machine allowing `:8181` **only from AERIE's IP**.
- **No `/api/v2` forward-auth exemption is needed** — because AERIE hits the LAN address
  directly, the API never traverses the proxy, and the `apikey` never lands in Traefik logs.
- The Tautulli web password lives as a **shared Authentik group attribute** — low-value (it only
  unlocks the already-Authentik-gated UI). Rotate it on both sides together; don't reuse it.
- **Verify** (once live): `curl 'http://<service-lan-ip>:8181/api/v2?apikey=<key>&cmd=get_activity'`
  returns JSON **with no Basic credentials** — Tautulli's API authenticates via `apikey` and
  should bypass `http_basic_auth`. If it returns 401, the API path is broken; rely on the host
  firewall rule and re-check Tautulli's API settings.
