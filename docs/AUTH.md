# Authentication

AERIE **always requires authentication**. There are two modes:

- **OIDC** — any OpenID Connect provider (Authentik, Keycloak, Google, Pocket-ID, Zitadel, …).
  Enabled when `OIDC_ISSUER` + `OIDC_CLIENT_ID` + `OIDC_CLIENT_SECRET` are all set.
- **Local admin** — when OIDC is not configured, the first visit to `/login` shows a
  **create-admin** setup form. After that, `/login` is an email + password sign-in. Passwords
  are hashed (scrypt) at rest. See [Local admin](#local-admin-no-oidc) below.

---

## OIDC setup (generic)

### 1. Create an OAuth2 / OpenID client in your provider

- **Client type**: Confidential
- **Grant**: Authorization Code (PKCE)
- **Redirect URI**:
  ```
  https://<AERIE_PORTAL_URL>/api/auth/callback/<OIDC_PROVIDER_ID>
  ```
  With the default `OIDC_PROVIDER_ID=oidc` that is
  `https://media.example.com/api/auth/callback/oidc`.
- Copy the **Issuer URL**, **Client ID** and **Client Secret**.

### 2. Emit a groups claim (for the admin role)

Role is derived from group membership. Configure your IdP to emit a `groups` claim (the claim
name is configurable via `OIDC_GROUPS_CLAIM`). Members of `AERIE_ADMIN_GROUP` get the `admin`
role; everyone else is `user`.

`AERIE_ADMIN_GROUP` can be **any existing group name in your IdP** — you don't have to create a
dedicated `admins` group. To gate admin on, say, your existing `Plex admins` group, just set
`AERIE_ADMIN_GROUP=Plex admins`.

> **Matching caveats.** The group name is matched **exactly and case-sensitively** — `plex admins`
> will *not* match a group named `Plex admins`. Group names containing spaces only work when the
> claim is emitted as a **list/array** (the Authentik mapping below returns `list(...)`, so it is);
> a scope mapping that returns a single delimited *string* gets split on whitespace/commas, which
> would break a multi-word name like `Plex admins`.

If your IdP can't emit groups (e.g. Google), use `AERIE_ADMIN_EMAILS` instead — a comma-separated
allow-list of emails that get admin (matched case-insensitively).

> **Authentik example.** The `groups` claim isn't emitted by default. Create a **Scope Mapping**
> (Customisation → Property Mappings) named `groups`, scope name `groups`, expression:
> ```python
> return list(request.user.ak_groups.values_list("name", flat=True))
> ```
> then add it under the provider's **Advanced settings → Scopes**.

### 3. Set AERIE env vars

```bash
OIDC_ISSUER=https://idp.example.com/application/o/aerie/
OIDC_CLIENT_ID=<client id>
OIDC_CLIENT_SECRET=<client secret>
OIDC_PROVIDER_NAME=Authentik          # login button: "Continue with Authentik"
OIDC_PROVIDER_ID=oidc                 # callback path segment
AUTH_SECRET=$(openssl rand -base64 32)
AERIE_ADMIN_GROUP=admins              # any IdP group name, e.g. "Plex admins" (exact, case-sensitive)
# AERIE_ADMIN_EMAILS=you@example.com  # alternative to groups
# AUTH_SESSION_MAX_AGE=86400          # Aerie session lifetime (s); default 24h
```

> **Session lifetime.** `AUTH_SESSION_MAX_AGE` (seconds, default 24h) bounds Aerie's own JWT
> session. Keep it near your IdP's session duration so Aerie doesn't stay signed in long after the
> **forward-auth** session behind embedded services has expired — otherwise reopening a service
> embed redirects the iframe to a login page that refuses framing (see `docs/EMBEDDING.md`). The
> JWT is *sliding* (refreshed on activity), so this bounds **idle** lifetime, not active use.

> **The redirect URI must match exactly.** The callback path is
> `…/api/auth/callback/<OIDC_PROVIDER_ID>` — with the default `OIDC_PROVIDER_ID=oidc` it ends in
> `oidc` (spelling: `o-i-d-c`, *not* `oicd`). Providers like Authentik match the redirect URI
> **strictly**, so a typo or a stale path registered in the IdP surfaces as
> *"The request fails due to a missing, invalid, or mismatching redirection URI (redirect_uri)."*
> Register the exact path the app sends, or override the segment with `OIDC_PROVIDER_ID`.

---

## Local admin (no OIDC)

Leave the `OIDC_*` vars unset. On first run, any route redirects to `/login`, which shows a
**Create admin account** form (name, email, password). Submitting it creates an `admin` user with
a hashed password and signs you in. Subsequent visits show an email + password login.

- Still set `AUTH_SECRET` in production (stable JWT signing) and `ENCRYPTION_KEY` (service-secret
  encryption).
- The create-admin form is only available while OIDC is off **and** no admin exists yet.
