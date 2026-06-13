# Requests — Overseerr / Jellyseerr

AERIE integrates with **Overseerr** (or the API-compatible **Jellyseerr**) to power the Requests
view and the discover feeds: browse/search media, submit requests, and (as an admin) approve/decline.

## What AERIE surfaces

- **Requests** — pending/approved/processing/available/failed, with authoritative counts.
- **Discover** — trending, popular movies/TV, upcoming, and the user watchlist (Overseerr → TMDB,
  cached ~1h).
- **Issues** — open Overseerr issues (count + sample).
- **Per-user quotas** — movie/TV request quotas shown and editable in Admin.
- **Version** — surfaced as the service version badge.

## Setup

1. **Admin → Services → Add service** — type `Overseerr` (or `Jellyseerr`); the preset fills the
   category/icon.
2. Set **Host** to the Overseerr address.
3. Paste the **API key** (Overseerr → Settings → General → API Key), stored encrypted and sent as
   `X-Api-Key`.

Both read and **write** operations are supported when configured: member discover→confirm→submit
(`overseerrCreateRequest`) and admin approve/decline/comment (`overseerrReview`/`overseerrComment`) —
all server-side via stored credentials.

## Notes

- **CSRF:** Overseerr mutations fail with *"invalid csrf token"* when **CSRF Protection** is ON and
  the API key isn't exempt. Turn CSRF Protection **off** in Overseerr → Settings → Network (the API
  key is the auth) if requests/reviews 403.
- Jellyseerr uses the same API surface; AERIE treats it as Overseerr-compatible.
- No request data shows until the API key is stored (real-data-or-empty).
