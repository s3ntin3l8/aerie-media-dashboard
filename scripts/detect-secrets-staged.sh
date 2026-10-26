#!/usr/bin/env bash
# Pre-commit secret scan over the staged files, using the same baseline and detect-secrets
# version as CI (`ci-node.yml` runs `detect-secrets-hook --baseline .secrets.baseline`).
# Optional locally: without detect-secrets installed it skips with a notice, and CI stays
# the hard gate. Install with `pip install detect-secrets==1.5.0`.
set -euo pipefail

if ! command -v detect-secrets-hook >/dev/null 2>&1; then
  echo "detect-secrets not installed: skipping local secret scan (CI enforces it)"
  exit 0
fi

# -r: nothing staged (or only deletions) means nothing to scan.
git diff --cached --name-only --diff-filter=ACMR -z \
  | xargs -0 -r detect-secrets-hook --baseline .secrets.baseline --
