#!/usr/bin/env bash
# PostToolUse (Edit|Write) — Layer 0 (static/types) + Layer 4 (structural/complexity)
# on the single file that was just written. Fast feedback only; the full suite
# lives in gate.sh (Stop hook). Exit 2 surfaces stderr back to Claude to fix.
set -uo pipefail

input=$(cat)
file=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty' <<<"$input")
[ -z "$file" ] && exit 0

case "$file" in
  *.ts|*.mts)
    [ -f "$file" ] || exit 0   # deletion / rename away — nothing to check

    npx prettier --write "$file" >/dev/null 2>&1 || true

    case "$file" in
      *.spec.ts|*.spec.mts)
        : # spec files are eslint-ignored in this repo (see eslint.config.mjs)
        ;;
      *)
        if ! npx eslint --max-warnings 0 "$file" 2>&1 | tail -40 >/tmp/cc-eslint.out; then
          echo "Layer 0/4 — eslint/complexidade falhou em $file:" >&2
          cat /tmp/cc-eslint.out >&2
          exit 2
        fi
        ;;
    esac

    if ! npm run --silent typecheck 2>&1 | tail -30 >/tmp/cc-tsc.out; then
      echo "Layer 0 — typecheck falhou:" >&2
      cat /tmp/cc-tsc.out >&2
      exit 2
    fi
    ;;
esac

exit 0
