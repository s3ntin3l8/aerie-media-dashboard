# Contributing

## Getting started

```bash
git clone https://github.com/s3ntin3l8/aerie-media-dashboard
cd aerie-media-dashboard
npm install          # also installs Husky pre-commit/pre-push hooks
cp .env.example .env # fill in AUTH_SECRET + ENCRYPTION_KEY at minimum
npm run dev          # dev server at http://localhost:3001
```

No database setup is required for development — `lib/db/bootstrap.ts` lazily migrates and seeds on first use. The dev server runs without OIDC (local-credentials mode); create the first admin on the `/login` setup screen.

## Quality gates

All four must pass before a PR can merge. CI runs them on every push and PR to `main`; the pre-push Husky hook runs them locally before `git push`.

| Gate | Command | What it checks |
|---|---|---|
| Lint | `npm run lint` | ESLint (no errors; warnings allowed) |
| Typecheck | `npm run typecheck` | `tsc --noEmit` (strict) |
| Tests | `npm run test` | Vitest unit + component tests |
| Build | `npm run build` | Next.js production build |

CI uses `npm run test:coverage` (Vitest + v8 coverage) and uploads to [Codecov](https://codecov.io). Two Codecov gates enforce:
- **project**: overall coverage must not drop more than 1%.
- **patch**: lines you changed must be covered.

Every PR that touches `app/**`, `components/**`, or `lib/**` must ship with tests for the new/changed lines. Write tests that assert behavior, not coverage-padding renders. See the "Testing" section below.

## Workflow

```
feature branch → quality gates → commit → push → PR → squash merge to main
```

- **Never commit straight to `main`** — open a PR for every change.
- Use **Conventional Commit** prefixes in all commit messages — Release Please derives the `CHANGELOG.md` and version bumps from them:
  - `fix(scope): …` — patch bump
  - `feat(scope): …` — minor bump
  - `chore(scope):`, `test(scope):`, `docs(scope):`, `refactor(scope):` — no bump

## Testing

Tests live in `tests/unit/` (Vitest, Node environment) and `tests/components/` (Vitest, jsdom). The vitest config defines two projects: `server` (Node) for unit tests and `browser` (jsdom) for component tests.

Key patterns:
- Server-only modules (`lib/db`, `lib/integrations`, `lib/env`, `lib/session`) import `"server-only"`, which jsdom cannot resolve. Component tests that transitively pull these in must `vi.mock` them — grep the existing `tests/components/*.test.tsx` files for the pattern.
- Integration client tests mock `@/lib/integrations/http` (the `fetchJson` function) — see `tests/unit/clientsMocks.ts`.
- In-process auth caches (`lib/integrations/tokenCache`) persist across tests keyed by base URL — use distinct base URLs per test or call `clearCache()` in `beforeEach`.
- Use `vi.hoisted()` when a `vi.mock` factory needs to reference a `vi.fn()` declared in the same file.

Run coverage locally and inspect which changed lines are uncovered before pushing:

```bash
npm run test:coverage   # generates coverage/coverage-summary.json and coverage/lcov.info
```

## Architecture notes

See [`CLAUDE.md`](CLAUDE.md) for the full architecture reference (data flow, auth model, persistence, integrations layer, deployment). Highlights:

- **Real-data-or-empty** — panels show live upstream data or a graceful empty state; no mock fallback.
- **Auth always required** — OIDC or local credentials; no anonymous access except `/login`, `/api/auth`, `/api/health`, and brand assets.
- **`lib/env.ts`** is the single server-only env source. Never read `process.env` directly in client components.
- **Server actions** in `app/(portal)/admin/actions.ts` are all `requireAdmin()`-guarded. Keep it that way.
- **Secrets** (service API keys) are AES-256-GCM encrypted at rest via `lib/crypto.ts`; they never reach the client.
- **Member snapshot scrubbing** (`lib/data/scrub.ts`) uses an allowlist — new `Snapshot`/`Service` fields are hidden by default. Add them deliberately.

## Migrations

Edit `lib/db/schema.ts`, then:

```bash
npm run db:generate   # drizzle-kit generate → new SQL migration in drizzle/
npm run db:migrate    # apply locally
```

The app self-bootstraps on first start (`lib/db/bootstrap.ts` → `ensureDb()`), so migrations run automatically in production too.
