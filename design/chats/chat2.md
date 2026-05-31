# Service Status Widget

_Started 2026-05-30 17:39 UTC_

---

## User

I would like to highlight the uptime of central services (e.g. Plex) on the dashboard a bit more (especially for the users)? Any ideas?

## Assistant

_[tool: list_files]_

Let me look at the existing dashboard to understand what you're working with.

_[tool: read_file]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: update_todos]_

I have a full picture now. Here's my read and a concrete idea.

## The problem
Right now, for a **member** (non-admin), uptime is buried: a thin 40px ticker (`All systems operational · 9/11 up`) and a small list in the right-rail Status panel. A friend who just wants to know *"is Plex up so I can watch?"* has to hunt for it among 11 services — most of which (Prowlarr, qBittorrent, Prometheus…) mean nothing to them.

## My idea — a "Central Services" spotlight band
A confidence-first band pinned at the **top of the dashboard**, surfacing only the 3 services members actually care about — **Plex, Jellyfin, Requests (Overseerr)** — each as a large card with a big 30-day uptime figure, a Gatus-style heartbeat strip, response time, and an `OPERATIONAL` pill. Plus a plain-language reassurance line: *"All core services are up — stream away."*

I'll make it a Tweak (`spotlight` / `banner` / `off`) so you can compare the big-card treatment against a slim single-strip version, and turn it off to see the original.

Let me build it.Bumping the cache-buster so the edited modules reload. First, flag central services:

_[tool: str_replace_edit]_

_[tool: update_todos]_

Now build the `CentralServices` component. Adding it to `panels.jsx`:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: update_todos]_

Now wire it into Home as the lead element:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now add the tweak control and default. Updating `app.jsx`:

_[tool: str_replace_edit]_

Now bump the cache-buster (`?v=5` → `?v=6`) so the edited modules reload:

_[tool: run_script]_

_[tool: update_todos]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Done. Here's what I added to the dashboard:

**A "Central Services" spotlight band** pinned to the top of the home dashboard — surfacing only the three services members actually care about (**Plex**, **Jellyfin**, **Requests**), each as a large card with:
- A big **30-day uptime** figure (99.98%) + **response time**
- An `OPERATIONAL` status pill and a Gatus-style **heartbeat strip**
- A `Stream` / `Requests` role tag and a one-click Launch/Open link
- A plain-language reassurance line above it: *"All core services are up — stream away."* (turns amber/red and names the affected service if anything degrades)

It reads loud for friends and stays on-brand with the Sanctuary command-center vocabulary (mono numerals, uppercase eyebrows, status-colored stripes).

**Tweakable** under *Central services → Spotlight*:
- **spotlight** (default) — the big 3-card treatment
- **banner** — a slim single strip with inline uptime chips, if you want it quieter
- **off** — reverts to the original layout

Try flipping *View as → user* in Tweaks to see the member experience. Worth a look: do you want this band shown for admins too (it is now), or members-only?

## User

Verifier agent check completed

## Assistant

Verified clean. The Central Services spotlight is live at the top of the dashboard — let me know if you'd like it members-only, or any tuning to the card metrics.

