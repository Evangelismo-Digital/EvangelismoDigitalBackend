#!/usr/bin/env node
/**
 * Merges every security scanner's output into one report an agent or a
 * programmer can act on, and fails the build on anything unjustified.
 *
 * Four tools look at this codebase from different angles and each writes its
 * own format in its own directory: njsscan and Semgrep emit SARIF, ESLint emits
 * its own JSON, SonarQube keeps its findings on a server. Read separately they
 * are four partial pictures with heavy overlap — the same `Math.random` is
 * reported by three of them under three different rule ids. This collapses them
 * into one ranked list, deduplicated by file and line, so "what is wrong with
 * the security of this project" has a single answer.
 *
 * Suppressions live in security-suppressions.json, in the repository, each with
 * a justification. A finding that is not fixed and not justified fails the run.
 *
 * Usage: node scripts/security-report.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'

const OUT_DIR = 'reports/security'
const SUPPRESSIONS_FILE = 'security-suppressions.json'

const SOURCES = {
  njsscan: `${OUT_DIR}/njsscan.sarif`,
  semgrep: `${OUT_DIR}/semgrep.sarif`,
  snykOss: `${OUT_DIR}/snyk-oss.sarif`,
  snykCode: `${OUT_DIR}/snyk-code.sarif`,
  eslint: 'reports/eslint/eslint-report.json',
  sonarIssues: 'reports/sonar/issues.json',
  sonarHotspots: 'reports/sonar/hotspots.json',
}

/**
 * Paths whose findings are reported but never fail the build.
 *
 * k6 load scripts run against a disposable local stack and seed fake churches
 * with `Math.random`; they are not part of the deployed artifact (excluded from
 * tsconfig's build, from the Docker image, and from `sonar.sources`).
 */
const NON_SHIPPING_PATHS = [/^src\/load-test\//, /\.spec\.[cm]?ts$/, /^scripts\//]

/** ESLint rules that are security findings rather than style. */
const SECURITY_RULE_PREFIXES = ['security/', 'sonarjs/no-hardcoded', 'sonarjs/no-weak', 'sonarjs/insecure-']
const SECURITY_RULE_EXACT = new Set([
  'sonarjs/hashing',
  'sonarjs/os-command',
  'sonarjs/sql-queries',
  'sonarjs/code-eval',
  'sonarjs/no-clear-text-protocols',
  'sonarjs/pseudo-random',
  'sonarjs/no-intrusive-permissions',
  'sonarjs/publicly-writable-directories',
  'sonarjs/no-os-command-from-path',
  'sonarjs/no-hardcoded-ip',
  'no-eval',
  'no-new-func',
  '@typescript-eslint/no-implied-eval',
])

const SEVERITY_ORDER = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }

function isSecurityRule(ruleId) {
  if (!ruleId) return false
  return SECURITY_RULE_EXACT.has(ruleId) || SECURITY_RULE_PREFIXES.some((prefix) => ruleId.startsWith(prefix))
}

/**
 * The newest modification time anywhere under src/.
 *
 * Used only to warn: an input report older than the code it describes will
 * happily list findings that have already been fixed, and the person reading it
 * has no way to tell.
 */
function newestSourceMtime() {
  const stack = ['src']
  let newest = 0

  while (stack.length > 0) {
    const current = stack.pop()

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = `${current}/${entry.name}`

      if (entry.isDirectory()) {
        stack.push(path)
        continue
      }

      newest = Math.max(newest, statSync(path).mtimeMs)
    }
  }

  return newest
}

function warnIfStale(sourceMtime) {
  for (const [name, path] of Object.entries(SOURCES)) {
    if (!existsSync(path)) continue

    if (statSync(path).mtimeMs < sourceMtime) {
      console.warn(`[security] AVISO: ${path} (${name}) é mais antigo que o código — pode listar achados já corrigidos.`)
    }
  }
}

function readJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.warn(`[security] ignorando ${path}: ${error.message}`)
    return null
  }
}

/** SARIF paths arrive as absolute container URIs (`file:///src/...`). */
function normalizePath(raw) {
  return String(raw ?? '')
    .replace(/^file:\/\//, '')
    .replace(/^\/src\//, 'src/')
    .replace(new RegExp(`^${process.cwd()}/`), '')
    .replace(/^\.\//, '')
}

function sarifSeverity(level) {
  if (level === 'error') return 'HIGH'
  if (level === 'warning') return 'MEDIUM'
  return 'LOW'
}

function collectSarif(tool, path) {
  const sarif = readJson(path)
  if (!sarif) return []

  return (sarif.runs ?? []).flatMap((run) => {
    // SARIF puts the severity on the rule, not the result, unless the result
    // overrides it; without this lookup everything collapses to one level.
    const rules = new Map((run.tool?.driver?.rules ?? []).map((rule) => [rule.id, rule]))

    return (run.results ?? []).map((result) => {
      const location = result.locations?.[0]?.physicalLocation
      const rule = rules.get(result.ruleId)

      return {
        tool,
        rule: result.ruleId ?? 'unknown',
        file: normalizePath(location?.artifactLocation?.uri),
        line: location?.region?.startLine ?? 0,
        severity: sarifSeverity(result.level ?? rule?.defaultConfiguration?.level ?? 'warning'),
        message: (result.message?.text ?? '').trim(),
        extra: result.properties?.cwe ?? rule?.properties?.cwe ?? '',
      }
    })
  })
}

function collectEslint() {
  const report = readJson(SOURCES.eslint)
  if (!report) return []

  return report.flatMap((file) =>
    file.messages
      .filter((message) => isSecurityRule(message.ruleId))
      .map((message) => ({
        tool: 'eslint',
        rule: message.ruleId,
        file: normalizePath(file.filePath),
        line: message.line ?? 0,
        severity: message.severity === 2 ? 'HIGH' : 'MEDIUM',
        message: message.message,
        extra: '',
      })),
  )
}

function collectSonar() {
  const issues = readJson(SOURCES.sonarIssues) ?? []
  const hotspots = readJson(SOURCES.sonarHotspots) ?? []

  const securityIssues = issues
    .filter((issue) => (issue.impacts ?? []).some((impact) => impact.softwareQuality === 'SECURITY'))
    .map((issue) => ({
      tool: 'sonarqube',
      rule: issue.rule,
      file: normalizePath((issue.component ?? '').split(':').slice(1).join(':')),
      line: issue.line ?? 0,
      severity:
        (issue.impacts ?? []).find((impact) => impact.softwareQuality === 'SECURITY')?.severity?.toUpperCase() ??
        'MEDIUM',
      message: issue.message,
      extra: '',
    }))

  const pendingHotspots = hotspots
    .filter((hotspot) => hotspot.status !== 'REVIEWED')
    .map((hotspot) => ({
      tool: 'sonarqube-hotspot',
      rule: hotspot.ruleKey,
      file: normalizePath((hotspot.component ?? '').split(':').slice(1).join(':')),
      line: hotspot.line ?? 0,
      severity: (hotspot.vulnerabilityProbability ?? 'MEDIUM').toUpperCase(),
      message: hotspot.message,
      extra: 'security hotspot — precisa de revisão humana',
    }))

  return [...securityIssues, ...pendingHotspots]
}

/**
 * One entry per file:line, carrying every tool that reported it.
 *
 * Three scanners flagging the same line is one problem to fix, not three, and
 * a list that says so is the difference between a report someone works through
 * and a report someone scrolls past.
 */
function deduplicate(findings) {
  const merged = new Map()

  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}`
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, { ...finding, tools: [finding.tool], rules: [finding.rule] })
      continue
    }

    existing.tools.push(finding.tool)
    existing.rules.push(finding.rule)

    if (SEVERITY_ORDER[finding.severity] < SEVERITY_ORDER[existing.severity]) {
      existing.severity = finding.severity
      existing.message = finding.message
    }
  }

  return [...merged.values()].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.file.localeCompare(b.file),
  )
}

function loadSuppressions() {
  const raw = readJson(SUPPRESSIONS_FILE) ?? []
  return new Map(raw.map((entry) => [`${entry.rule}@${entry.file}:${entry.line}`, entry]))
}

function isSuppressed(finding, suppressions) {
  return finding.rules.some((rule) => suppressions.has(`${rule}@${finding.file}:${finding.line}`))
}

function isShipping(finding) {
  return !NON_SHIPPING_PATHS.some((pattern) => pattern.test(finding.file))
}

function renderFindings(title, findings) {
  if (findings.length === 0) return `\n### ${title}\n\nNenhum.\n`

  const lines = [`\n### ${title} (${findings.length})\n`]
  lines.push('| Severidade | Local | Regra(s) | Ferramenta(s) | Descrição |')
  lines.push('| --- | --- | --- | --- | --- |')

  for (const finding of findings) {
    const rules = [...new Set(finding.rules)].join(', ')
    const tools = [...new Set(finding.tools)].join(', ')
    const message = finding.message.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 160)
    lines.push(`| ${finding.severity} | \`${finding.file}:${finding.line}\` | \`${rules}\` | ${tools} | ${message} |`)
  }

  return lines.join('\n')
}

warnIfStale(newestSourceMtime())

const all = deduplicate([
  ...collectSarif('njsscan', SOURCES.njsscan),
  ...collectSarif('semgrep', SOURCES.semgrep),
  ...collectSarif('snyk-oss', SOURCES.snykOss),
  ...collectSarif('snyk-code', SOURCES.snykCode),
  ...collectEslint(),
  ...collectSonar(),
])

const suppressions = loadSuppressions()
const suppressed = all.filter((finding) => isSuppressed(finding, suppressions))
const nonShipping = all.filter((finding) => !isSuppressed(finding, suppressions) && !isShipping(finding))
const blocking = all.filter((finding) => !isSuppressed(finding, suppressions) && isShipping(finding))

const bySource = new Map()
for (const finding of all) for (const tool of finding.tools) bySource.set(tool, (bySource.get(tool) ?? 0) + 1)

/**
 * Which scanners actually produced output.
 *
 * A tool that did not run and a tool that found nothing both contribute zero
 * findings, and conflating them is how a report comes to certify a scan that
 * never happened — Snyk Code, for instance, silently skips without SNYK_TOKEN.
 * Presence of the input file is the evidence; the table says so per tool.
 */
const TOOL_LABELS = {
  njsscan: 'njsscan',
  semgrep: 'Semgrep (security rulesets)',
  snykOss: 'Snyk Open Source (SCA)',
  snykCode: 'Snyk Code (SAST)',
  eslint: 'ESLint (regras de segurança)',
  sonarIssues: 'SonarQube (issues)',
  sonarHotspots: 'SonarQube (hotspots)',
}

const executionStatus = Object.entries(SOURCES).map(([key, path]) => ({
  label: TOOL_LABELS[key] ?? key,
  ran: existsSync(path),
}))

const toolsSkipped = executionStatus.filter((tool) => !tool.ran)

const markdown = [
  '# Relatório de segurança',
  '',
  'Consolida njsscan, Semgrep, as regras de segurança do ESLint e os achados de',
  'segurança do SonarQube em uma lista só, deduplicada por `arquivo:linha`.',
  '',
  `Gerado em: ${new Date().toISOString()}`,
  '',
  '## Resumo',
  '',
  '| | Quantidade |',
  '| --- | --- |',
  `| Achados que bloqueiam | ${blocking.length} |`,
  `| Fora do artefato publicado | ${nonShipping.length} |`,
  `| Suprimidos com justificativa | ${suppressed.length} |`,
  `| Total (deduplicado) | ${all.length} |`,
  '',
  '### Ferramentas executadas',
  '',
  '| Ferramenta | Executou? |',
  '| --- | --- |',
  ...executionStatus.map((tool) => `| ${tool.label} | ${tool.ran ? '✅ sim' : '⚠️ **NÃO**'} |`),
  '',
  ...(toolsSkipped.length > 0
    ? [
        `> ⚠️ ${toolsSkipped.length} ferramenta(s) não executaram — este relatório NÃO é uma varredura completa.`,
        '> Snyk exige `SNYK_TOKEN` (use `.env.security`). Snyk Code exige, além disso,',
        '> que Snyk Code esteja habilitado para a organização no painel da Snyk.',
        '',
      ]
    : []),
  '### Achados por ferramenta',
  '',
  '| Ferramenta | Achados |',
  '| --- | --- |',
  ...[...bySource.entries()].map(([tool, count]) => `| ${tool} | ${count} |`),
  '',
  '## Achados',
  renderFindings('Bloqueiam o build', blocking),
  renderFindings('Fora do artefato publicado (load-test, specs, scripts)', nonShipping),
  renderFindings('Suprimidos com justificativa', suppressed),
  '',
  '## Como resolver um achado',
  '',
  '1. Corrija o código — é sempre a primeira opção.',
  `2. Se for um falso positivo, registre-o em \`${SUPPRESSIONS_FILE}\` com`,
  '   `rule`, `file`, `line` e uma `justification` que explique POR QUE aquele',
  '   ponto é seguro. A justificativa vai para o git e é revisável.',
  '3. Nunca desative a ferramenta inteira para calar um achado.',
  '',
].join('\n')

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(`${OUT_DIR}/findings.json`, JSON.stringify({ blocking, nonShipping, suppressed }, null, 2))
writeFileSync(`${OUT_DIR}/SECURITY-REPORT.md`, markdown)

console.log(`[security] ferramentas que executaram: ${executionStatus.filter((t) => t.ran).map((t) => t.label).join(', ') || 'nenhuma'}`)
for (const tool of toolsSkipped) {
  console.warn(`[security] AVISO: ${tool.label} NÃO executou — a varredura está incompleta.`)
}
console.log(`[security] achados bloqueantes: ${blocking.length}`)
console.log(`[security] fora do artefato publicado: ${nonShipping.length}`)
console.log(`[security] suprimidos com justificativa: ${suppressed.length}`)
console.log(`[security] relatório: ${OUT_DIR}/SECURITY-REPORT.md`)

for (const finding of blocking) {
  console.error(`[security] ${finding.severity} ${finding.file}:${finding.line} ${[...new Set(finding.rules)].join(',')}`)
}

if (blocking.length > 0) process.exitCode = 1
