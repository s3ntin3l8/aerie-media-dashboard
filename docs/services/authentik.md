# Authentik integration

AERIE reads your **Authentik** instance's REST API to show, per service, **who can access it** —
the provider type/name and the groups bound to each application. This complements the
provider-agnostic "behind SSO" badge derived from Traefik (see [`traefik.md`](./traefik.md)): Traefik
tells you a route *is* behind forward-auth; Authentik tells you *which groups* may use it.

It's **read-only and display-only** — AERIE never writes to Authentik and does not change AERIE's own
visibility matrix. Provider-specific by design: it only activates when an admin adds an "Authentik"
service. AERIE stays generic OIDC for every other deployment.

## Where it shows up

- **Admin → Services** — each service whose Authentik launch URL matches its host gains an access chip:
  `everyone` (no access binding → all users), the bound **group name(s)**, or `restricted` (user/policy
  bindings only). The tooltip lists the provider type/name, groups, user count, and whether a policy gates
  access. Table and mobile card both show it.
- **`GET /api/authentik/apps`** — an admin-only JSON endpoint returning the correlated apps (debugging).
  The Admin data is the source of truth.
- **Connection test.** The Admin "Test" action validates the token by calling
  `/api/v3/admin/version/` (Bearer). Because that endpoint is admin-namespaced, a green result also
  confirms the token belongs to a **superuser** (which AERIE needs for `superuser_full_list`); a
  non-superuser or invalid token fails the test.

## Forward-auth outpost correlation (parent domains)

Many estates protect a whole domain with a single Authentik **forward-auth proxy outpost** — one
application launching at, say, `unraid.example.com` that guards every `*.unraid.example.com` service via
the embedded/proxy outpost. Those per-service subdomains have **no app of their own**, so an exact-host
match would leave them blank.

AERIE handles this: when no app's launch host exactly matches a service, it falls back to the
**proxy/forward-auth** app whose launch host is a **parent domain** of the service host (e.g.
`sonarr.unraid.example.com` inherits the `unraid.example.com` outpost). The **most specific** (longest)
parent wins, and only **Proxy Provider** apps are eligible — OAuth2/OpenID apps never suffix-match their
subdomains. Inherited access is marked in the chip tooltip as *"via &lt;outpost&gt; outpost"* so it's
clear the access is domain-wide rather than app-specific.

## How access is resolved

For each application AERIE reads its **policy bindings** (`/api/v3/policies/bindings/`):

- **No enabled access binding → `everyone`** (this is Authentik's default: an app with no bindings is
  open to all users).
- A binding to a **group** → that group can access (shown as a chip).
- A binding to a **user** → counted ("N users" in the tooltip).
- A binding to an **expression policy** → flagged "policy-gated" (AERIE can't resolve a policy to a group).
- Disabled (`enabled: false`) or negated (`negate: true`) bindings are ignored.

## Requirements

1. **An API token.** Create a token in Authentik (Directory → Tokens, or a service account). To list **all**
   applications regardless of per-user access, the token's user should be a **superuser** — AERIE requests
   `?superuser_full_list=true`. A non-superuser token still works but only sees apps it can access.
2. **Launch URLs set.** Apps correlate to AERIE services by the **host of their launch URL**
   (`meta_launch_url`/`launch_url`). An app with no absolute launch URL can't be matched and is skipped.

## Setup in AERIE

1. **Admin → Services → Add service.** Type `Authentik` — the preset fills category/icon and labels the
   secret field "API token".
2. Set **Host** to the Authentik base URL AERIE should reach server-side (e.g. `authentik.example.com`
   or an internal address via the **internal URL** field).
3. Paste the **API token** as the secret (sent as `Authorization: Bearer <token>`). Required.
4. **(Optional) self-signed TLS** → enable **Skip TLS verification** (LAN hosts only).

Within ~12 s (the snapshot poll) the access chips appear on services whose host matches an Authentik app.

## Troubleshooting

- **No chips appear.** Confirm the Authentik service is active with a stored token, and the app launch-URL
  hosts match the AERIE service **Host** (or a parent-domain forward-auth outpost covers them). Use the
  Admin **Test** action — a green version means the token is valid and a superuser. Check
  `GET /api/authentik/apps` (as an admin) returns entries.
- **A service under a forward-auth outpost still shows no chip.** Only **Proxy Provider** apps are used
  for parent-domain matching, and the outpost app must have an **absolute launch URL** on the parent
  domain. OAuth2 apps deliberately don't suffix-match their subdomains.
- **An app shows `everyone` unexpectedly.** That app has no enabled group/user/policy binding in Authentik
  — add a binding there to restrict it.
- **Truncation.** AERIE fetches up to 1000 apps/bindings per call and logs a warning if Authentik paginates
  beyond that.

## Scope & limitations

- Read-only; no Authentik changes, no reconcile of AERIE's visibility matrix (a "sync group access ↔ AERIE
  visibility" feature is a possible future follow-up).
- Correlation is **by launch-URL host only**.
- Group access reflects **bindings on the application**; nested-group/inherited access and complex policy
  expressions are summarized as group chips + a "policy-gated" flag, not fully evaluated.
