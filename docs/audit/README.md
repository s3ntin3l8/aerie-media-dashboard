# Audit reports

Every audit in this repo is one report in this folder. The report is committed; the
evidence is local (`docs/audit/assets/`, gitignored). Structure, naming and rules: the
`audit` skill (`s3ntin3l8/ai-agent-skills`, `plugins/audit`).

## This repo

- **Scope token:** `portal` (the authenticated product surface; `app/` is framework-generic).
- **Capture:** `make screenshots-audit AUDIT=<slug>` (visual-kit, Docker). The scenes tagged `audit` in
  `visual/scenes.json` run against the isolated demo (`make demo`, fictional data, throwaway admin, loopback
  only, clock fixed by `DEMO_NOW`) at phone, tablet and desktop, dark and light, with axe results; the evidence
  lands in `docs/audit/assets/<slug>/`. Needs `npx playwright install chromium` for the demo's sign-in. If the
  demo hangs at sign-in with hundreds of "Compiled" lines, delete `.next/` and retry (stale cache after an
  interrupted run).

## Index

| Audit | Scope | Outcome |
|---|---|---|
| [2026-10 UI/UX](2026-10-portal-ui-ux.md) | portal | 9 P1 fixed with tests; the 7 deferred P2/P3 items (#275–#281) fixed in a follow-up |
