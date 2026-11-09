#!/bin/bash
# Host side of visual/hooks.mjs. Usage: host-hooks.sh <name> <demo-dir> [args…]
#   session        prints the demo admin's cookies as JSON ([{"name","value",…}]); `make demo` keeps the session in
#                  <demo-dir>/.demo/storage-state.json while it runs (DEMO_STORAGE_STATE, see the Makefile).
#   clock <mode>   switches the fake upstream's clock to `frozen` (the stills) or `live` (the loop, which then runs
#                  from DEMO_NOW); see scripts/demo/clock.mjs. Back to `frozen` it waits for the app's polling to
#                  pick the frozen data up again, so a still never shows the loop's moving values.
set -euo pipefail

case "$1" in
  session)
    file="$2/.demo/storage-state.json"
    [ -f "$file" ] || { echo "no $file: is the demo running from $2?" >&2; exit 1; }
    node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).cookies))' "$file"
    ;;
  clock)
    mode="${3:?clock needs frozen or live}"
    answer="$(curl -fsS --max-time 10 -X POST "http://127.0.0.1:${DEMO_UPSTREAM_PORT:-3931}/__clock/$mode")"
    if [ "$mode" = frozen ] && [[ "$answer" == *'"changed":true'* ]]; then sleep 10; fi
    echo "$answer"
    ;;
  *) echo "unknown host hook $1" >&2; exit 2 ;;
esac
