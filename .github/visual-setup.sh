#!/usr/bin/env bash
# What the demo needs on a clean runner (called by the shared visual workflows, after they installed Node).
# `make demo` starts the fake upstream and `next dev` itself; it signs in through a headless Chromium on the host
# (scripts/demo/admin.mjs), which the project's Playwright has to provide.
set -euo pipefail

npm ci --no-audit --no-fund
npx playwright install --with-deps chromium
