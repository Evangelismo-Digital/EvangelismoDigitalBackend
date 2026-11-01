#!/usr/bin/env bash
# CodeQL — local mirror of .github/workflows/codeql.yml.
#
# Same CLI version, same configuration file (.github/codeql/codeql-config.yml),
# same two languages. Writes one SARIF per language into reports/security/,
# where scripts/security-report.mjs merges the security findings with the other
# scanners'. Run it alone with `npm run security:codeql`; `npm run security:scan`
# runs it as one of its stages.
#
# The CLI bundle (~1 GB unpacked) is downloaded once into
# ${XDG_CACHE_HOME:-~/.cache}/codeql/<version> and verified against the SHA-256
# below, the same way the scanner images in this repo are pinned by digest.
set -euo pipefail

cd "$(dirname "$0")/.."

# Keep in lockstep with the `tools:` URL in .github/workflows/codeql.yml.
CODEQL_VERSION=2.27.3
CODEQL_BUNDLE_SHA256=64518dc413c8e7b5733fee2489e830a899bb1e3f28c8873b5869d5cc90164c5c
CODEQL_LANGUAGES=(javascript-typescript actions)
# `database create --db-cluster` names each database after its EXTRACTOR, which
# is not the language alias: javascript-typescript lands in db/javascript.
declare -A CODEQL_DB_DIR=([javascript-typescript]=javascript [actions]=actions)

OUT_DIR=reports/security
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/codeql/$CODEQL_VERSION"
CODEQL="$CACHE_DIR/codeql/codeql"

log() { printf '\033[1;34m[codeql]\033[0m %s\n' "$1"; }

if [ ! -x "$CODEQL" ]; then
  log "baixando o CodeQL bundle $CODEQL_VERSION (uma vez só, para $CACHE_DIR)..."
  mkdir -p "$CACHE_DIR"
  archive="$CACHE_DIR/codeql-bundle-linux64.tar.gz"
  curl -fsSL -o "$archive" \
    "https://github.com/github/codeql-action/releases/download/codeql-bundle-v$CODEQL_VERSION/codeql-bundle-linux64.tar.gz"
  echo "$CODEQL_BUNDLE_SHA256  $archive" | sha256sum --check --quiet
  tar -xzf "$archive" -C "$CACHE_DIR"
  rm -f "$archive"
fi

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
mkdir -p "$OUT_DIR"

log "criando os bancos de dados (${CODEQL_LANGUAGES[*]})..."
"$CODEQL" database create "$work_dir/db" \
  --db-cluster \
  --language="$(IFS=,; echo "${CODEQL_LANGUAGES[*]}")" \
  --build-mode=none \
  --source-root=. \
  --codescanning-config=.github/codeql/codeql-config.yml \
  --threads=0 \
  > "$work_dir/create.log" 2>&1 || { cat "$work_dir/create.log"; exit 1; }

for language in "${CODEQL_LANGUAGES[@]}"; do
  log "analisando $language..."
  # No query argument: the suite comes from the config embedded in the
  # database by --codescanning-config, exactly as in the GitHub workflow.
  # Alert-suppression results ride along, so `// codeql[...]` comments reach
  # the SARIF as `suppressions` instead of as findings.
  "$CODEQL" database analyze "$work_dir/db/${CODEQL_DB_DIR[$language]}" \
    --format=sarif-latest \
    --output="$OUT_DIR/codeql-$language.sarif" \
    --sarif-category="/language:$language" \
    --threads=0 \
    --quiet
done

log "SARIF em $OUT_DIR/codeql-*.sarif"
