#!/usr/bin/env bash
# Stop hook — the machine review that replaces "did it actually finish?".
# Runs the fast verification layers (0, 2, and — when Docker is up — 1 + Stage 4).
# Mutation testing (Layer 5) is deliberately NOT here: never run it before unit
# tests are green, and it never belongs in the inner loop.
set -uo pipefail

input=$(cat)
session=$(jq -r '.session_id // "nosession"' <<<"$input")

# Anti-loop guard: enforce at most once per ~60s per session, otherwise a
# Stop hook that keeps exiting 2 loops forever.
guard="/tmp/claude-gate-$session"
if [ -f "$guard" ] && [ $(( $(date +%s) - $(stat -c %Y "$guard") )) -lt 60 ]; then
  rm -f "$guard"
  exit 0
fi
touch "$guard"

out=/tmp/cc-gate.out
fail() { echo "$1" >&2; tail -40 "$out" >&2; exit 2; }

npm run --silent typecheck     >"$out" 2>&1 || fail "Layer 0 — typecheck falhou:"
npm run --silent lint          >"$out" 2>&1 || fail "Layer 0/4 — lint falhou:"
npm run --silent test:unit:all >"$out" 2>&1 || fail "Layer 2/3 — testes unitários falharam:"

if docker info >/dev/null 2>&1 && docker compose ps --status running 2>/dev/null | grep -q db; then
  npm run --silent test:acceptance >"$out" 2>&1 || fail "Layer 1 — testes de aceitação falharam:"
  npm run --silent test:e2e        >"$out" 2>&1 || fail "Stage 4 — testes de integração falharam:"
fi

rm -f "$guard"
exit 0
