# The *arr suite & automation companions

The "automation" category covers the *arr media managers and their companions. They share a common
shape: an **API key** (most send it as the `X-Api-Key` header), read-only data in AERIE, and a
graceful empty state until the key is stored in **Admin → Services**.

| Service | Surfaces | Secret |
|---|---|---|
| **Sonarr / Radarr** | download queue, upcoming calendar, recent history, disk space, health warnings | API key |
| **Lidarr / Readarr / Whisparr** | *arr-family (queue/calendar/history via the shared *arr API) | API key |
| **Listenarr** | audiobook library stats, queue, history, health (its own `/api/v1`) | API key |
| **LazyLibrarian** | book/audiobook totals (books, authors, wanted, snatched) | API key |
| **Prowlarr** | indexer health + grab/query stats | API key |
| **NZBHydra2** | indexer health (enabled/total/errored) | API key |
| **Bazarr** | wanted (missing) subtitle counts (episodes, movies) | API key |
| **Agregarr** | collection sync status (active/running/progress/last sync) | API key |
| **Wizarr** | invite/user stats (users, invites, pending, expired) | API key |

## Setup (common)

1. **Admin → Services → Add service** — type the app name; the preset fills category/icon/logo.
2. Set **Host** to the service address (use **internal URL** for a LAN address so server-side API
   calls bypass the public proxy — see [`../EMBEDDING.md`](../EMBEDDING.md)).
3. Paste the **API key**. For the *arr apps it's **Settings → General → Security → API Key**.

## Per-app notes

- **Sonarr / Radarr** are the richest: they feed the Download Queue (when "arr" is the active queue
  source), the upcoming calendar, recent grabs/imports, storage mounts, and health warnings.
- **Lidarr / Readarr / Whisparr** use the same *arr API family; they surface queue/calendar/history
  where applicable.
- **Listenarr** has its **own** `/api/v1` (not the shared *arr API). Use `/history/type/{X}` rather
  than `/history/recent`; timestamps are suffix-less UTC.
- **Download Queue source** — Sonarr/Radarr/Listenarr, NZBGet, and qBittorrent all expose queue
  progress; only one feeds the panel at a time (the `queueSource` deployment setting). See
  [`download-clients.md`](download-clients.md).
- All data is read-only and degrades per-panel: a dead or unconfigured app only blanks its own widget.
