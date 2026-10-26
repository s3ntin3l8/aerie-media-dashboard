#!/usr/bin/env bash
# Pre-commit secret scan over what is STAGED, using the same baseline and detect-secrets
# version as CI (`ci-node.yml` runs `detect-secrets-hook --baseline .secrets.baseline`).
# Optional locally: without detect-secrets installed it skips with a notice, and CI stays
# the hard gate. Install with `pip install detect-secrets==1.5.0`.
#
# detect-secrets reads file contents from disk, so the staged blobs are exported to a scratch
# tree first: a key removed in the working copy but still in the index is still caught.
set -euo pipefail

if ! command -v detect-secrets-hook >/dev/null 2>&1; then
  echo "detect-secrets not installed: skipping local secret scan (CI enforces it)"
  exit 0
fi

files=()
while IFS= read -r -d '' f; do files+=("$f"); done \
  < <(git diff --cached --name-only --diff-filter=ACMR -z)
[ "${#files[@]}" -gt 0 ] || exit 0

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
printf '%s\0' "${files[@]}" | git checkout-index --prefix="$scratch/" -z --stdin
# Scan a copy of the baseline so the hook can never rewrite the committed one.
cp .secrets.baseline "$scratch/.secrets.baseline"
(cd "$scratch" && detect-secrets-hook --baseline .secrets.baseline -- "${files[@]}")
