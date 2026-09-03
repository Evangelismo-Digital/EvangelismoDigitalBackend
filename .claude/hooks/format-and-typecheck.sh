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

    # ESLint scope guard. eslint.config.mjs registers the `import` plugin only
    # for `src/**` and `spec/**`, while the block declaring import/* rules has
    # no `files` key — so linting anything outside those trees dies with
    # "could not find plugin import" (repo-root vite.config.mts, and so on).
    # Those files still get Prettier and the whole-project typecheck below.
    #
    # `--no-warn-ignored` keeps eslint-ignored paths (specs, src/generated,
    # src/load-test) from tripping `--max-warnings 0` on the "File ignored"
    # warning, which would otherwise fail the hook for a file it did not lint.
    case "$file" in
      *.spec.ts|*.spec.mts)
        : # spec files are eslint-ignored in this repo (see eslint.config.mjs)
        ;;
      */src/*|*/spec/*)
        if ! npx eslint --no-warn-ignored --max-warnings 0 "$file" 2>&1 | tail -40 >/tmp/cc-eslint.out; then
          echo "Layer 0/4 — eslint/complexidade falhou em $file:" >&2
          cat /tmp/cc-eslint.out >&2
          exit 2
        fi
        ;;
      *)
        : # outside eslint.config.mjs's `files` scope — Prettier + tsc only
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
