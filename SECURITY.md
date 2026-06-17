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

Out-of-scope issues:
- Missing HSTS or CSP — HSTS belongs on the reverse proxy (Traefik); CSP is intentionally minimal because the app embeds third-party iframes.
- Rate limiting limited to login — acceptable for the single-container self-hosted use case.
