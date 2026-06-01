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
name is configurable via `OIDC_GROUPS_CLAIM`). Members of `AERIE_ADMIN_GROUP` (default `admins`)
get the `admin` role; everyone else is `user`.

If your IdP can't emit groups (e.g. Google), use `AERIE_ADMIN_EMAILS` instead — a comma-separated
allow-list of emails that get admin.

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
AERIE_ADMIN_GROUP=admins
# AERIE_ADMIN_EMAILS=you@example.com  # alternative to groups
```

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
