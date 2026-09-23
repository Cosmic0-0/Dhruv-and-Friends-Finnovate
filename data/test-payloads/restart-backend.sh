#!/bin/sh
# Restarts the local FraudLens backend on :4000, which also resets its rate
# limits. Used by webapp-ui.mjs and webapp-payloads.mjs. Run it with Git Bash
# on Windows (it uses netstat/taskkill).
#
#   sh restart-backend.sh                     # AI on the shared Ollama host
#   AI_URL=http://127.0.0.1:9 AI_MODE=local sh restart-backend.sh   # "AI down"
#   KILL_ONLY=1 sh restart-backend.sh         # just stop it ("backend down")
#
# AI_URL / AI_MODE override OLLAMA_URL / LLM_MODE for this run only;
# backend/.env is not touched. Check `tailscale status` first: hosts move.
HERE=$(cd "$(dirname "$0")" && pwd)
BACKEND="$HERE/../../backend"
mkdir -p "$HERE/results"
LOG="$HERE/results/backend.log"
for p in $(netstat -ano | grep -E ':4000 .*LISTENING' | awk '{print $5}' | sort -u); do taskkill //F //PID $p >/dev/null 2>&1; done
[ -n "$KILL_ONLY" ] && { sleep 0.5; echo "backend stopped"; exit 0; }
i=0; while netstat -ano | grep -qE ':4000 .*LISTENING'; do i=$((i+1)); [ $i -gt 50 ] && break; sleep 0.2; done
export OLLAMA_URL="${AI_URL:-${OLLAMA_URL:-http://100.91.27.102:11434}}"
export LLM_MODE="${AI_MODE:-auto}"
cd "$BACKEND"
nohup node --env-file-if-exists=.env src/index.js </dev/null >"$LOG" 2>&1 &
i=0; until curl -s -m 2 http://localhost:4000/health/llm >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 100 ] && { echo "backend did not start"; exit 1; }; sleep 0.3; done
echo "backend restarted (OLLAMA_URL=$OLLAMA_URL LLM_MODE=$LLM_MODE): $(curl -s -m 20 http://localhost:4000/health/llm)"
