# Audit reports

Every audit in this repo is one report in this folder. The report is committed; the
evidence is local (`docs/audit/assets/`, gitignored). Structure, naming and rules: the
`audit` skill (`s3ntin3l8/ai-agent-skills`, `plugins/audit`).

## This repo

- **Scope token:** `portal` (the authenticated product surface; `app/` is framework-generic).
- **Capture:** `node <audit skill>/scripts/capture.mjs <slug>`. Config in `capture.json`: it
  starts the isolated demo (`make demo`, fictional data, throwaway admin, loopback only), signs in
  through the session the demo writes, and captures every route at phone, tablet and desktop, plus
  axe results in `axe.json`. Needs `npx playwright install chromium`. If the demo hangs at sign-in
  with hundreds of "Compiled" lines, delete `.next/` and retry (stale cache after an interrupted run).

## Index

| Audit | Scope | Outcome |
|---|---|---|
| [2026-10 UI/UX](2026-10-portal-ui-ux.md) | portal | 9 P1 fixed with tests; polish deferred to issues |
