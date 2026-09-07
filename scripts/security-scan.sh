#!/usr/bin/env bash
# Security scan: runs the code-level scanners and consolidates every finding
# into reports/security/SECURITY-REPORT.md via scripts/security-report.mjs.
#
# This is the "what is wrong with the security of this code" pass, and it is
# deliberately separate from the dependency and secret scanners already in
# ci:local (OSV-Scanner reads the lockfile, gitleaks reads the diff): those
# answer different questions and neither reads the source for vulnerable
# patterns.
#
# Requires Docker. Semgrep needs network access to fetch its rulesets.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT_DIR=reports/security
mkdir -p "$OUT_DIR"

# Optional local credential file, gitignored and 0600 — the same pattern the
# SonarQube stack uses for .sonar/. It exists because the usual advice ("export
# it in ~/.bashrc") does not work for tooling: a stock .bashrc returns early for
# non-interactive shells, so an export near the bottom of it is invisible to
# every script, hook and CI runner. An env var already set always wins.
if [ -f .env.security ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.security
  set +a
fi

# njsscan is Node-specific (OWASP): hardcoded secrets, insecure random, unsafe
# express/fastify configuration, path traversal, weak crypto. It publishes no
# version tags, so it is pinned by digest — the same reproducibility the other
# scanners get from a version tag.
NJSSCAN_IMAGE=opensecurity/njsscan@sha256:20b5094acea05e70bdcf6c2a7048cac78609540d430bba2e4d9d7698b6a9b9bc
SEMGREP_IMAGE=semgrep/semgrep:1.170.0

log() { printf '\033[1;34m[security]\033[0m %s\n' "$1"; }

# ─────────────────────────────────────────────────────────────────────────────
log 'njsscan (OWASP NodeJS scanner)...'
# `|| true`: a non-zero exit means findings, and findings are the output we
# want. scripts/security-report.mjs is what decides whether they fail the build.
docker run --rm -v "$(pwd)/src:/src:ro" "$NJSSCAN_IMAGE" \
  --sarif /src > "$OUT_DIR/njsscan.sarif" 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
log 'semgrep (security rulesets)...'
# Different rulesets from the SAST stage in ci-local.sh: those are the language
# correctness packs, these are the security ones — injection, authz, crypto,
# OWASP Top 10 and the same insecure-transport checks Sonar reports.
docker run --rm -v "$(pwd):/src" -w /src "$SEMGREP_IMAGE" \
  semgrep scan --metrics=off --sarif --quiet \
  --config p/security-audit \
  --config p/owasp-top-ten \
  --config p/secrets \
  --exclude node_modules --exclude dist --exclude coverage --exclude reports \
  --exclude .stryker-tmp --exclude .ci-local \
  > "$OUT_DIR/semgrep.sarif" 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# Snyk Code — semantic/taint analysis, which is a different technique from the
# pattern matching above: it follows user-controlled values through the call
# graph, so it reaches injection and traversal bugs that only appear when a
# source and a sink are several functions apart.
#
# Requires SNYK_TOKEN. Absent, the stage SKIPS loudly rather than failing: a
# missing credential is an environment problem, and turning it into a red
# pipeline would train people to ignore a red pipeline. `security-report.mjs`
# reports the tool as absent, so a skipped scan is never mistaken for a clean one.
if [ -n "${SNYK_TOKEN:-}" ]; then
  # --- Snyk Open Source (SCA) -------------------------------------------------
  # Deliberately NOT `--all-projects`: that walks every package-lock.json under
  # the tree, including the .stryker-tmp mutation sandboxes, which are throwaway
  # copies pinned to whatever the dependencies were when the last mutation run
  # started. They produced 102 findings against versions this project no longer
  # uses — noise that hides the two real ones. Same reason the Trivy stage in
  # ci-local.sh skips that directory.
  #
  # Overlaps with OSV-Scanner by design: the two use different advisory
  # databases, and Snyk caught fast-uri CVE-2026-84292 / CVE-2026-84394 (reached
  # through Fastify) that OSV did not report.
  log 'snyk open source (SCA)...'
  npx --no-install snyk test \
    --sarif-file-output="$OUT_DIR/snyk-oss.sarif" \
    --severity-threshold=low \
    >/dev/null 2>&1 || true

  # --- Snyk Code (SAST / taint) ----------------------------------------------
  # Requires Snyk Code to be enabled for the organization (Settings -> Snyk Code
  # in the Snyk web UI). Without it the CLI returns SNYK-CODE-0005 / 403, which
  # is a licensing state rather than a scan result — so it is reported as
  # not-run instead of clean, and never fails the build.
  log 'snyk code (análise semântica / taint)...'
  if npx --no-install snyk code test \
      --sarif-file-output="$OUT_DIR/snyk-code.sarif" \
      --severity-threshold=low \
      >/dev/null 2>&1; then
    :
  elif [ ! -s "$OUT_DIR/snyk-code.sarif" ]; then
    log 'AVISO: Snyk Code indisponível (provavelmente SNYK-CODE-0005 — não habilitado para a organização).'
    rm -f "$OUT_DIR/snyk-code.sarif"
  fi
else
  log 'AVISO: SNYK_TOKEN ausente — Snyk não executado. Defina-o em .env.security (0600, gitignored).'
  rm -f "$OUT_DIR/snyk-oss.sarif" "$OUT_DIR/snyk-code.sarif"
fi

# ─────────────────────────────────────────────────────────────────────────────
# The ESLint report is regenerated by default. A stale one is the worst outcome
# this script can produce: it reports a finding that was already fixed, and a
# report that is wrong about the easy cases teaches people to distrust it about
# the hard ones. ci:local sets SECURITY_REUSE_REPORTS=1 because its SonarQube
# stage generated the file seconds earlier.
if [ "${SECURITY_REUSE_REPORTS:-0}" != '1' ] || [ ! -f reports/eslint/eslint-report.json ]; then
  log 'gerando o relatório do ESLint...'
  mkdir -p reports/eslint
  npx eslint src/ -f json -o reports/eslint/eslint-report.json || true
fi

log 'consolidando...'
node scripts/security-report.mjs
