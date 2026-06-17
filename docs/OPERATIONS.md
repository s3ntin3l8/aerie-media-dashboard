# Operations runbook

## Architecture summary

AERIE is a single Docker container (`ghcr.io/s3ntin3l8/aerie:edge`) running Next.js standalone behind Traefik. All persistent state lives in one SQLite file; all outbound calls are server-side. There is no external database.

```
Traefik (reverse proxy + TLS + forward-auth)
  └─ dashboard-aerie-1  (Next.js, port 3000)
       ├─ /app/data/aerie.db  ← bind-mounted from ./data on the host
       └─ env: AUTH_SECRET, ENCRYPTION_KEY, OIDC_*, …
```

---

## Environment variables

All vars are set in `.env` (copy from `.env.example`). The values are **not** accessible to the browser; `lib/env.ts` is `server-only`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_SECRET` | ✅ | — | Auth.js session-signing secret. Generate: `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | ✅ | — | AES-256-GCM key for service secrets. Generate: `openssl rand -hex 32`. **Back this up.** |
| `OIDC_ISSUER` | For OIDC | — | OIDC discovery URL (`https://auth.example.com/…`) |
| `OIDC_CLIENT_ID` | For OIDC | — | Client ID registered in the IdP |
| `OIDC_CLIENT_SECRET` | For OIDC | — | Client secret |
| `OIDC_PROVIDER_NAME` | No | `SSO` | Login button label ("Continue with …") |
| `OIDC_PROVIDER_ID` | No | `oidc` | Auth.js provider id → callback path `/api/auth/callback/<id>` |
| `OIDC_PROVIDER_ICON` | No | `shield_person` | Material Symbol icon on the login button |
| `OIDC_SCOPES` | No | `openid email profile groups` | Requested OIDC scopes |
| `OIDC_GROUPS_CLAIM` | No | `groups` | JWT claim carrying group memberships (some IdPs use `roles`) |
| `AERIE_ADMIN_GROUP` | No | `admins` | Group whose members receive the `admin` role |
| `AERIE_ADMIN_EMAILS` | No | — | Comma-separated emails granted admin regardless of groups |
| `AUTH_SESSION_MAX_AGE` | No | `86400` | Session lifetime in seconds (sliding) |
| `DATABASE_URL` | No | `file:./data/aerie.db` | libSQL/SQLite URL (Turso: `libsql://…`) |
| `AERIE_DATA_DIR` | No | `./data` | Host folder bind-mounted to `/app/data` |
| `AERIE_UID` / `AERIE_GID` | No | `1000` | UID:GID the container runs as (must own `AERIE_DATA_DIR`) |
| `AERIE_CONFIG_FILE` | No | `./config/aerie.yaml` | Path to declarative YAML config |
| `PROMETHEUS_INSTANCE` | No | — | Filter node_exporter metrics to one instance label |
| `AERIE_BRAND` | No | `AERIE` | Portal name shown in the UI |
| `AERIE_PORTAL_URL` | No | — | Public URL (used in OG metadata) |
| `AERIE_PERF_LOG` | No | — | Set to any value to enable perf-timing `console.log` output |

See also: [`docs/AUTH.md`](AUTH.md) for the full OIDC setup and group-mapping walk-through.

---

## Backup and restore

### What to back up

Two things must be backed up together — the database **and** the encryption key. The database is useless without the key; the key is useless without the database.

| Item | Location | Contains |
|---|---|---|
| Database | `./data/aerie.db` (host) | Services, encrypted secrets, groups, visibility, users, prefs |
| Encryption key | `.env` → `ENCRYPTION_KEY` | Required to decrypt every stored service API key |

### Backup procedure

**Option 1 — while the container is running (online backup):**

```bash
sqlite3 ./data/aerie.db ".backup ./data/aerie-$(date +%Y%m%d).db"
```

`sqlite3 .backup` uses SQLite's online backup API, so it's safe under concurrent writes.

**Option 2 — cold copy (container stopped):**

```bash
docker compose stop
cp ./data/aerie.db ./data/aerie-$(date +%Y%m%d).db
docker compose start
```

### Restore procedure

```bash
docker compose stop
cp ./data/aerie-<date>.db ./data/aerie.db
# Ensure .env contains the ENCRYPTION_KEY that matches the backup
docker compose start
```

After restoring, verify the app starts and services/secrets load in Admin.

---

## `ENCRYPTION_KEY` rotation and recovery

> ⚠️ **Critical:** losing or changing `ENCRYPTION_KEY` without a migration step renders all stored service API keys permanently unreadable.

### Current state (v1.0)

There is no automated key-rotation tool. The key is AES-256-GCM; ciphertext is stored as `{iv, authTag, ciphertext}` per row in `service_secrets`. Changing the key without re-encrypting the rows will cause every `decrypt()` call to throw, blanking all service panels.

### If you need to rotate the key

Manual procedure (no downtime tooling yet):

1. Record the current `ENCRYPTION_KEY` from `.env`.
2. In Admin → Services, note the API keys for every service (re-enter them after rotation, or export them first using a DB query — see below).
3. Stop the container.
4. Update `ENCRYPTION_KEY` in `.env`.
5. Start the container — the app starts but all service panels are blank (no secrets decrypt).
6. In Admin → Services, re-enter each API key. The new key is used for all new writes.

**Exporting plaintext secrets before rotation (requires direct DB access):**

```bash
# Run this BEFORE changing the key, while the old key is still in .env
docker exec dashboard-aerie-1 \
  node -e "
    const { decrypt } = require('./lib/crypto');
    const { db } = require('./lib/db/client');
    const rows = db.prepare('SELECT service_id, secret FROM service_secrets').all();
    rows.forEach(r => console.log(r.service_id, decrypt(JSON.parse(r.secret))));
  "
```

> 🔧 **Post-1.0:** a `db:reencrypt` script (`tsx scripts/reencrypt.ts <old-key> <new-key>`) is planned to automate this. Track in [GitHub Issues](https://github.com/s3ntin3l8/aerie-media-dashboard/issues).

### If the key is lost

If `ENCRYPTION_KEY` is lost and no backup exists, stored secrets cannot be recovered. Recovery:

1. Set a new `ENCRYPTION_KEY`.
2. Re-enter every service API key manually in Admin → Services.

This is why backing up both the database **and** the key together is essential.

---

## Updating the deployment

CI pushes a fresh `ghcr.io/s3ntin3l8/aerie:edge` image on every push to `main`. To pull and apply:

```bash
docker compose pull          # fetch the latest :edge from GHCR
docker compose up -d         # recreate the container on the new image
```

Database migrations are applied automatically on startup (`lib/db/bootstrap.ts` → `ensureDb()`).

To test a **local working-tree build** before merging:

```bash
# Uncomment `build: .` in docker-compose.override.yml (takes precedence over image:)
docker compose build
docker compose up -d
```

---

## Health check

The `/api/health` endpoint returns `{"status":"ok"}` (HTTP 200) when the database is reachable, or `{"status":"error"}` (HTTP 503) otherwise. It does not require authentication.

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok"}
```

The `Dockerfile` includes a `HEALTHCHECK` directive polling this endpoint every 30s. Check container health with:

```bash
docker inspect --format '{{.State.Health.Status}}' dashboard-aerie-1
# healthy
```

---

## Logs

The app emits structured operational messages via `console.warn` (tagged with a service prefix, e.g. `[config]`, `[authentik]`) and opt-in perf timings via `console.log` when `AERIE_PERF_LOG` is set. View live logs:

```bash
docker compose logs -f aerie
```

There is no external log aggregation by default. For log retention, pipe container stdout/stderr to your host logging daemon (e.g. `journald`, `loki` via a Docker log driver).
