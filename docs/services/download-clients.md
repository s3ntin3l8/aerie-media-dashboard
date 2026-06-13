# Download clients — NZBGet & qBittorrent

AERIE shows download-client activity (queue + transfer stats) in the Download Client widget. Both
clients authenticate with a **`username:password` credential pair** packed into the single secret
field (split on the first `:`), matching the convention used elsewhere (e.g. Beszel's
`email:password`). Enter it as `username:password` in **Admin → Services** — the field hints the
format.

| Service | Surfaces | Secret |
|---|---|---|
| **NZBGet** | global rate / remaining / paused; queue (Usenet) | `username:password` — **optional** (auth can be disabled) |
| **qBittorrent** | global transfer stats (dl/up speed, counts); torrent list | `username:password` — **required** |

## NZBGet

- Auth is **optional** — NZBGet can run with control access disabled. If so, leave the secret blank;
  AERIE still reads it (gated on the service being **active**, not on a stored secret). With auth on,
  store `username:password` (sent as HTTP Basic).
- Status (`nzbgetStatus`) is read whenever NZBGet is configured so the widget can show client stats
  even when it isn't the active queue source.

## qBittorrent

- Store `controluser:controlpass` (qBittorrent → Options → Web UI). **Required** — AERIE logs in
  (`/api/v2/auth/login`) to get a session cookie, then reads transfer info and the torrent list.
- The torrent list only fires when qBittorrent is the active **queue source**; global stats fire
  whenever it's configured.

## Queue source

Sonarr/Radarr/Listenarr ("arr"), NZBGet, and qBittorrent all surface queue progress, but only one
fills the Download Queue panel at a time — chosen by the `queueSource` deployment setting (auto-falls
back to whichever is configured). The *arr companions are documented in
[`arr-suite.md`](arr-suite.md).

## Notes

- A malformed pair (no `:`) is caught by inline validation in the add/edit modal before you can test.
- Credentials are encrypted at rest (AES-256-GCM) and never sent to the browser.
