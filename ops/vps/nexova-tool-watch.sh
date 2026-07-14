#!/usr/bin/env bash
#
# nexova-tool-watch.sh
#
# Restart the `nexova` Hermes gateway when the agent tool MANIFEST changes, so a
# newly-deployed tool (added in app/src/lib/agent/tools.ts → live on Vercel)
# gets picked up without a manual SSH + restart.
#
# Why a diff, not "restart on every deploy": Hermes caches its MCP tool list at
# gateway startup, and restarting briefly drops the Telegram poller. Most deploys
# don't touch the toolset, so we restart ONLY when the set of tool *names*
# actually changes. Description-only edits won't trigger a restart (they don't
# change what the agent can do).
#
# Runs under a systemd --user timer (see nexova-tool-watch.timer), so it inherits
# the user-systemd environment that `hermes ... gateway` needs.
#
# Reads the API base + key from the gateway's own config.yaml — single source of
# truth, nothing to keep in sync.
set -euo pipefail

PROFILE="nexova"
HERMES_HOME="$HOME/.hermes/profiles/$PROFILE"
CONFIG="$HERMES_HOME/config.yaml"
HASH_FILE="$HERMES_HOME/.tool-manifest.hash"
LOG="$HERMES_HOME/logs/tool-watch.log"

# hermes lives in ~/.local/bin; systemd --user units get a minimal PATH.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$HERMES_HOME/logs"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

# Single-instance guard: skip if a previous run (e.g. a slow restart) is active.
exec 9>"$HERMES_HOME/.tool-watch.lock"
if ! flock -n 9; then
    exit 0
fi

API_BASE=$(grep -E "NEXOVA_API_BASE:" "$CONFIG" | head -1 | awk '{print $2}')
API_KEY=$(grep -E "AGENT_API_KEY:" "$CONFIG" | head -1 | awk '{print $2}')
if [ -z "${API_BASE:-}" ] || [ -z "${API_KEY:-}" ]; then
    log "ERROR: could not read NEXOVA_API_BASE/AGENT_API_KEY from $CONFIG"
    exit 1
fi

# Fetch the live manifest. Network hiccup → skip this cycle, try again next tick.
MANIFEST=$(curl -s --max-time 20 "$API_BASE/api/agent" -H "x-api-key: $API_KEY") || {
    log "WARN: manifest fetch failed (network?) — skipping this cycle"
    exit 0
}

# A valid manifest always carries tools. Empty/garbage (deploy mid-flight, auth
# error, HTML error page) → skip, so we never restart on a bad read.
if ! printf '%s' "$MANIFEST" | grep -q '"name"'; then
    log "WARN: manifest had no tools (deploy in progress / auth error?) — skipping"
    exit 0
fi

# Hash the SORTED, de-duped set of tool names: order-independent, and changes
# only when a tool is added / removed / renamed.
NEW_HASH=$(printf '%s' "$MANIFEST" | grep -o '"name":"[^"]*"' | sort -u | sha256sum | awk '{print $1}')
OLD_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

# No change → done (the common case; silent, no log spam).
[ "$NEW_HASH" = "$OLD_HASH" ] && exit 0

# First ever run: record the baseline, do NOT restart.
if [ -z "$OLD_HASH" ]; then
    printf '%s' "$NEW_HASH" > "$HASH_FILE"
    log "Baseline recorded ($NEW_HASH) — no restart on first run."
    exit 0
fi

COUNT=$(printf '%s' "$MANIFEST" | grep -o '"name":"[^"]*"' | wc -l | tr -d ' ')
log "Tool set changed (now $COUNT tools) — restarting $PROFILE gateway…"

hermes -p "$PROFILE" gateway stop  >> "$LOG" 2>&1 || true
sleep 3
hermes -p "$PROFILE" gateway start >> "$LOG" 2>&1 || true

printf '%s' "$NEW_HASH" > "$HASH_FILE"
log "Restart complete — new baseline $NEW_HASH ($COUNT tools)."
log "NOTE: open a NEW Telegram conversation to see the new tools (per-conversation cache)."
