#!/usr/bin/env bash
# Restarts the express server that the e2e workflows run in the background, so
# the forced-update flow can change its environment. scripts/e2e-run.mjs runs it
# as E2E_API_RESTART_CMD, with the variables to add or remove already set or
# unset in this script's environment. Express's dotenv never overrides a
# variable that is already set, so those variables win over express's .env.
#
# E2E_API_DIR is the express checkout. Its api.pid holds the running server's
# pid, and api.log takes the server's output. The script stops that pid, waits
# for it to exit, starts `node dist/index.js` again with this environment, and
# writes the new pid. It returns at once; the runner waits until express serves
# the new configuration.
set -euo pipefail

dir="${E2E_API_DIR:?set E2E_API_DIR to the express checkout}"
cd "$dir"

if [ -f api.pid ]; then
  pid=$(cat api.pid)
  if kill -0 "$pid" 2>/dev/null; then
    # It may exit between the check and the signal; the wait below still checks.
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 30); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "express $pid did not stop within 30 s; killing it" >&2
      kill -9 "$pid" 2>/dev/null || true
      sleep 1
    fi
    if kill -0 "$pid" 2>/dev/null; then
      echo "express $pid is still running" >&2
      exit 1
    fi
  fi
fi

nohup node dist/index.js >> api.log 2>&1 < /dev/null &
echo $! > api.pid
echo "express restarted as pid $(cat api.pid)"
