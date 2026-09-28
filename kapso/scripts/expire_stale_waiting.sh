#!/bin/bash
# Wrapper launchd/cron. El script Node carga .env.
set -euo pipefail
ROOT="/Users/diego/Documents/Sync/projects/lifedeportes"
exec /usr/bin/node "$ROOT/kapso/scripts/run_expire_stale_waiting.js"
