# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x (latest) | ✅ |
| < 1.0 | ❌ |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately via GitHub's [Security advisories](https://github.com/s3ntin3l8/aerie-media-dashboard/security/advisories/new) ("Report a vulnerability" in the Security tab). Include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof-of-concept.
- Any relevant environment details (version, deployment config).

You will receive acknowledgement within 48 hours. Confirmed vulnerabilities will be addressed in a new patch release; you will be credited in the release notes unless you prefer otherwise.

## Scope

AERIE is a **private self-hosted portal** — it is not a public-facing multi-tenant service. The expected threat model is:

- Authentication is always required (OIDC or local credentials); unauthenticated routes are `/login`, `/api/auth`, `/api/health`, and static brand assets only.
- All service API keys are encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`); they never reach the browser.
- Members (non-admins) receive a scrubbed snapshot that excludes admin-only fields (`users`, `groups`, `visibility`, Traefik/Authentik infra, per-service `internalUrl`/`forwardAuthConfig`/`hasSecret`).
- The app is designed to reach internal LAN hosts (media servers, *arr apps, etc.) — outbound HTTP to private IP ranges is intentional and not considered SSRF.
- Security response headers are set on every response by `middleware.ts`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and a CSP whose `script-src` is locked to a per-request nonce (`script-src 'self' 'nonce-<per-request>' 'strict-dynamic'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'`). The nonce is minted in middleware and propagated to Next.js's scripts and the inline theme script, so an injected `<script>` cannot execute.

Out-of-scope issues:
- Missing HSTS — belongs on the reverse proxy (Traefik); the committed `docker-compose.yml` attaches an `aerie-hsts` middleware, and `docker-compose.traefik.example.yml` documents the full reference (incl. `stsPreload`).
- `frame-src`/`connect-src`/`style-src` are intentionally left unconstrained so the app can embed third-party service iframes, load remote API data, and apply inline styles; only script/worker execution is nonce-locked.
- Rate limiting limited to login — acceptable for the single-container self-hosted use case.
