# Authentik OIDC setup

AERIE authenticates via Authentik using OIDC (Auth.js v5). Auth is **off by default** — the
app runs as a dev-mode admin ("Dev User") until all three auth env vars are set. There is
nothing to break by skipping this for local development.

## 1. Create an Authentik application + OAuth2 provider

In your Authentik admin UI (**Applications → Providers → Create**):

1. **Provider type**: OAuth2/OpenID Connect
2. **Name**: `aerie` (or anything — the slug matters, not the display name)
3. **Client type**: Confidential
4. **Client ID**: copy this → `AUTH_AUTHENTIK_ID`
5. **Client Secret**: copy this → `AUTH_AUTHENTIK_SECRET`
6. **Redirect URIs**:
   ```
   https://<AERIE_PORTAL_URL>/api/auth/callback/authentik
   ```
   e.g. `https://media.example.com/api/auth/callback/authentik`
7. **Signing Key**: any RS256 key from your Authentik setup
8. **Scopes**: leave at the defaults for now — the groups scope is added separately below

Then create an **Application** that points at this provider. Note the application **slug** —
it appears in the issuer URL.

## 2. Add the `groups` scope mapping

The `groups` claim is not emitted by default. Without it, role derivation silently falls back
to `user` for everyone (including admins).

1. Go to **Customisation → Property Mappings → Create**
2. **Type**: Scope Mapping
3. **Name**: `groups`
4. **Scope name**: `groups`
5. **Expression**:
   ```python
   return list(request.user.ak_groups.values_list("name", flat=True))
   ```
6. Back in your OAuth2 provider → **Advanced settings → Scopes**: add the `groups` mapping

## 3. Set env vars

Add to your `.env`:

```dotenv
AUTH_AUTHENTIK_ISSUER=https://authentik.example.com/application/o/<app-slug>/
AUTH_AUTHENTIK_ID=<client-id-from-step-1>
AUTH_AUTHENTIK_SECRET=<client-secret-from-step-1>
AUTH_SECRET=<run: openssl rand -base64 32>

# Optional: which Authentik group gets the admin role (default: admins)
AERIE_ADMIN_GROUP=admins
```

The issuer URL format is always `https://<authentik-host>/application/o/<app-slug>/` — the
trailing slash is required.

### Behind a reverse proxy: `AUTH_URL` is mandatory

Auth.js builds the OIDC `redirect_uri` and callback URLs from the request host. Behind a
reverse proxy (Traefik) the app only sees its **internal** address, so without a pin Auth.js
mis-detects the origin as `http://0.0.0.0:3000` — the login redirect lands on a dead
`0.0.0.0:3000` URL and the Authentik callback fails (it surfaces as `error=Configuration` /
`invalid_client`, because the token-exchange `redirect_uri` no longer matches the authorize
step). Pin the public origin:

```dotenv
AUTH_URL=https://media.example.com   # must equal AERIE_PORTAL_URL, no trailing slash
```

With the provided `docker-compose.yml` this is **auto-derived from `AERIE_PORTAL_URL`**
(and `AUTH_TRUST_HOST=true` is set), so you don't normally set it by hand — just make sure
`AERIE_PORTAL_URL` is your real external origin. Set `AUTH_URL` explicitly only when running
outside compose.

`AUTH_SECRET` is mandatory once OIDC is on — Auth.js throws `MissingSecret` without it.
Generate one with:

```bash
openssl rand -base64 32
```

## 4. Verify

Restart the container (or `npm run dev`) and navigate to the portal. You should be redirected
to the Authentik login page. After signing in, the session role is derived from group
membership:

- Member of `AERIE_ADMIN_GROUP` → `admin` (full Admin UI access)
- Everyone else → `user` (portal view only)

If you land as a `user` when you expect `admin`, the groups scope mapping is not emitting — go
back to step 2.

## How the gate works

`lib/env.ts` exports `authConfigured`, which is `true` only when all three of
`AUTH_AUTHENTIK_ISSUER`, `AUTH_AUTHENTIK_ID`, and `AUTH_AUTHENTIK_SECRET` are set. Until then:

- `auth.ts` registers no providers (Auth.js is effectively off)
- `proxy.ts` passes all routes through without checking the session
- `lib/session.ts` returns a hardcoded dev admin user

Setting any two of the three vars (but not all three) leaves the app in mock mode — there is
no partial-auth state.
