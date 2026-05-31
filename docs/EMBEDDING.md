# Embedding services in AERIE

The portal embeds services in an `<iframe>` (the in-portal "Open" experience).
This only works when two conditions hold. **Validate them with the spike below
before relying on embedding.**

## Hard requirements

1. **Same registrable domain.** The portal and every embeddable service must
   share one eTLD+1 — e.g. `media.s3ntin3l8.de` (portal) + `radarr.s3ntin3l8.de`
   (service) both under `s3ntin3l8.de`. ✅ This is the case here. A service on a
   *different* registrable domain is third-party: the Authentik session cookie
   will **not** flow into the iframe and forward-auth will fail. Those services
   must stay launch-only (`embeddable: false`) — e.g. Plex (`plex.tv`).

2. **Framing allowed for the portal origin.** Most *arr apps / Jellyfin send
   `X-Frame-Options: SAMEORIGIN` or a restrictive CSP that blocks framing. Traefik
   must rewrite that on the embeddable routes:

   ```
   # replaces the framing policy with one that allows the portal origin
   traefik.http.middlewares.aerie-embed.headers.contentSecurityPolicy=frame-ancestors https://media.s3ntin3l8.de
   traefik.http.middlewares.aerie-embed.headers.customResponseHeaders.X-Frame-Options=
   ```

   Attach `aerie-embed@docker` **and** `forwardAuth-authentik@file` (forward-auth) to each
   embeddable service's router. See `docker-compose.yml` for the labels.

## The spike (run before trusting embedding)

The decisive risk is **Safari ITP**, which can block cookies in third-party-ish
contexts even for same-site subdomains. Chrome is generally fine post-3PC-rollback.

1. Pick one real embeddable service (e.g. `radarr.s3ntin3l8.de`) and apply both
   middlewares in Traefik.
2. Confirm the framing header is rewritten:
   ```
   curl -sI https://radarr.s3ntin3l8.de | grep -iE 'content-security-policy|x-frame-options'
   # expect: content-security-policy: frame-ancestors https://media.s3ntin3l8.de
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
