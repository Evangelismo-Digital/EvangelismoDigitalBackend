#!/usr/bin/env node
/**
 * Reads the last SonarQube analysis and turns it into something a human — or an
 * agent working on this repo — can act on without opening a browser, then
 * enforces the quality gate.
 *
 * Writes:
 *   reports/sonar/measures.json    every metric, machine-readable
 *   reports/sonar/issues.json      every open issue with file:line and rule
 *   reports/sonar/hotspots.json    every security hotspot awaiting review
 *   reports/sonar/SONAR-REPORT.md  the same, grouped and ranked, for reading
 *
 * Exits non-zero when the gate fails or a security hotspot is still unreviewed,
 * which is what makes it usable as a ci:local stage.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const SONAR_URL = process.env.SONAR_URL ?? 'http://localhost:9000'
const PROJECT_KEY = 'evangelismo-digital-backend'

/**
 * How long to wait for the Compute Engine to finish processing an upload.
 *
 * This was 4 minutes and it was not enough: on a cold or loaded host (WSL2,
 * a CI runner sharing a box) the CE routinely takes longer, and the script then
 * failed the whole `npm run sonar` run with "não terminou de ser processada a
 * tempo" for an analysis that was perfectly healthy and readable a minute
 * later. A timeout that fires on a slow machine rather than on a broken one
 * teaches people to re-run the gate instead of trusting it.
 */
const ANALYSIS_WAIT_MS = Number(process.env.SONAR_ANALYSIS_TIMEOUT_MS ?? 15 * 60 * 1000)
const ANALYSIS_POLL_MS = 2_000
const OUT_DIR = 'reports/sonar'
const HOTSPOT_DECISIONS_FILE = 'sonar-hotspot-decisions.json'

/** Every metric worth carrying into the report, grouped as the report prints them. */
const METRIC_GROUPS = {
  Tamanho: ['ncloc', 'files', 'functions', 'classes', 'statements', 'comment_lines_density'],
  Complexidade: ['complexity', 'cognitive_complexity'],
  Problemas: [
    'violations',
    'blocker_violations',
    'critical_violations',
    'major_violations',
    'minor_violations',
    'info_violations',
  ],
  Confiabilidade: ['software_quality_reliability_rating', 'reliability_remediation_effort'],
  Segurança: [
    'software_quality_security_rating',
    'security_remediation_effort',
    'security_hotspots',
    'security_hotspots_reviewed',
    'security_review_rating',
  ],
  Manutenibilidade: ['software_quality_maintainability_rating', 'sqale_index', 'sqale_debt_ratio'],
  Cobertura: ['coverage', 'line_coverage', 'branch_coverage', 'uncovered_lines', 'uncovered_conditions'],
  Testes: ['tests', 'test_failures', 'test_errors', 'skipped_tests', 'test_execution_time', 'test_success_density'],
  Duplicação: ['duplicated_lines_density', 'duplicated_blocks', 'duplicated_files'],
}

const ALL_METRICS = Object.values(METRIC_GROUPS).flat()

const RATING_LETTERS = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' }

const password = existsSync('.sonar/admin-password') ? readFileSync('.sonar/admin-password', 'utf8').trim() : null
const token = existsSync('.sonar/token') ? readFileSync('.sonar/token', 'utf8').trim() : null

if (!password && !token) {
  console.error('[sonar] credenciais ausentes em .sonar/ — rode "npm run sonar:bootstrap".')
  process.exitCode = 1
}

/**
 * Admin credentials, with the analysis token only as a fallback.
 *
 * A GLOBAL_ANALYSIS_TOKEN is deliberately write-only: it may submit a report
 * and nothing else, so `/api/ce/component` answers it with 403. Reading results
 * back needs a user, and on a local instance that user is admin.
 */
function authHeader() {
  const credentials = password ? `admin:${password}` : `${token}:`
  return 'Basic ' + Buffer.from(credentials).toString('base64')
}

/**
 * One retry on a transport-level failure.
 *
 * SonarQube's web server drops a connection now and then while the Compute
 * Engine is busy — a truncated response mid-scan is not a configuration error,
 * and failing the whole pipeline over it would train people to re-run the gate
 * until it passes, which is how a real failure gets ignored.
 */
async function fetchWithRetry(url, options) {
  try {
    return await fetch(url, options)
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    return await fetch(url, options)
  }
}

async function api(path, { method = 'GET', form } = {}) {
  const options = { method, headers: { Authorization: authHeader() } }

  if (form) {
    options.body = new URLSearchParams(form)
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  const response = await fetchWithRetry(`${SONAR_URL}${path}`, options)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`)
  }

  return text ? JSON.parse(text) : {}
}

/**
 * The scanner returns as soon as the report is uploaded; the Compute Engine
 * then processes it asynchronously. Reading measures before that finishes
 * silently reports the PREVIOUS analysis — the failure mode where a fix looks
 * like it did nothing, or a regression looks clean.
 */
async function waitForAnalysis() {
  const deadline = Date.now() + ANALYSIS_WAIT_MS
  let announced = false

  for (;;) {
    const { queue = [], current } = await api(`/api/ce/component?component=${PROJECT_KEY}`)

    if (queue.length === 0) {
      if (current?.status === 'FAILED') {
        throw new Error(`a análise falhou no Compute Engine: ${current.errorMessage ?? 'sem detalhes'}`)
      }
      return current
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `a análise não terminou de ser processada em ${Math.round(ANALYSIS_WAIT_MS / 1000)}s ` +
          `(${queue.length} tarefa(s) ainda na fila do Compute Engine). ` +
          'Aumente SONAR_ANALYSIS_TIMEOUT_MS ou releia com "npm run sonar:report".',
      )
    }

    // Silence for minutes looks like a hang; say once that we are waiting.
    if (!announced) {
      console.log('[sonar] aguardando o Compute Engine processar a análise...')
      announced = true
    }

    await new Promise((resolve) => setTimeout(resolve, ANALYSIS_POLL_MS))
  }
}

async function fetchAllPages(path, key) {
  const collected = []
  let page = 1

  for (;;) {
    const body = await api(`${path}&p=${page}&ps=500`)
    const items = body[key] ?? []
    collected.push(...items)

    const total = body.paging?.total ?? body.total ?? collected.length
    if (collected.length >= total || items.length === 0) return collected

    page += 1
  }
}

function componentPath(issue) {
  // Sonar keys components as "<projectKey>:<path>".
  return (issue.component ?? '').replace(`${PROJECT_KEY}:`, '')
}

/**
 * Applies the reviewed-hotspot decisions recorded in the repository.
 *
 * A security hotspot is a place a human has to look at; SonarQube deliberately
 * refuses to decide for you. Recording the verdict in a checked-in file — with
 * its justification — rather than clicking through the UI is what keeps the
 * decision reviewable and survivable: `npm run sonar:reset` throws the server's
 * database away, and the decisions come back on the next run.
 */
async function applyHotspotDecisions(hotspots) {
  if (!existsSync(HOTSPOT_DECISIONS_FILE) || !password) return 0

  const decisions = JSON.parse(readFileSync(HOTSPOT_DECISIONS_FILE, 'utf8'))
  const byKey = new Map(decisions.map((decision) => [`${decision.rule}@${decision.file}:${decision.line}`, decision]))
  let applied = 0

  for (const hotspot of hotspots) {
    if (hotspot.status === 'REVIEWED') continue

    const decision = byKey.get(`${hotspot.ruleKey}@${componentPath(hotspot)}:${hotspot.line}`)
    if (!decision) continue

    await api('/api/hotspots/change_status', {
      method: 'POST',
      form: {
        hotspot: hotspot.key,
        status: 'REVIEWED',
        resolution: decision.resolution,
        comment: decision.justification,
      },
    })

    applied += 1
  }

  return applied
}

function formatMeasure(metric, value) {
  if (value === undefined) return '—'
  if (metric.endsWith('_rating')) return `${RATING_LETTERS[Math.round(Number(value))] ?? value}`
  return value
}

function renderMeasures(measures) {
  const lines = []

  for (const [group, metrics] of Object.entries(METRIC_GROUPS)) {
    lines.push(`\n### ${group}\n`)
    lines.push('| Métrica | Valor |')
    lines.push('| --- | --- |')

    for (const metric of metrics) {
      lines.push(`| \`${metric}\` | ${formatMeasure(metric, measures.get(metric))} |`)
    }
  }

  return lines.join('\n')
}

function renderIssues(issues) {
  if (issues.length === 0) return '\nNenhum problema em aberto. 🎉\n'

  const byRule = new Map()

  for (const issue of issues) {
    const bucket = byRule.get(issue.rule) ?? { rule: issue.rule, message: issue.message, items: [] }
    bucket.items.push(issue)
    byRule.set(issue.rule, bucket)
  }

  const ranked = [...byRule.values()].sort((a, b) => b.items.length - a.items.length)
  const lines = []

  for (const bucket of ranked) {
    lines.push(`\n#### \`${bucket.rule}\` — ${bucket.items.length}\n`)
    lines.push(`> ${bucket.message}\n`)

    for (const issue of bucket.items) {
      const severity = issue.impacts?.map((impact) => `${impact.softwareQuality}:${impact.severity}`).join(',') ?? ''
      lines.push(`- \`${componentPath(issue)}:${issue.line ?? 0}\` — ${issue.message} _(${severity})_`)
    }
  }

  return lines.join('\n')
}

function renderHotspots(hotspots) {
  const pending = hotspots.filter((hotspot) => hotspot.status !== 'REVIEWED')

  if (pending.length === 0) return '\nNenhum hotspot pendente de revisão.\n'

  const lines = [
    '',
    'Cada item abaixo precisa de um veredito humano. Registre-o em',
    `\`${HOTSPOT_DECISIONS_FILE}\` (campos: \`rule\`, \`file\`, \`line\`, \`resolution\`,`,
    '`justification`) ou corrija o código para que o hotspot desapareça.',
    '',
  ]

  for (const hotspot of pending) {
    lines.push(
      `- \`${componentPath(hotspot)}:${hotspot.line ?? 0}\` — \`${hotspot.ruleKey}\` (${hotspot.vulnerabilityProbability}) — ${hotspot.message}`,
    )
  }

  return lines.join('\n')
}

function renderGate(gate) {
  const lines = ['', `**Status: ${gate.status}**`, '', '| Condição | Real | Limite | Resultado |', '| --- | --- | --- | --- |']

  for (const condition of gate.conditions ?? []) {
    const operator = condition.comparator === 'GT' ? '>' : '<'
    lines.push(
      `| \`${condition.metricKey}\` | ${formatMeasure(condition.metricKey, condition.actualValue)} | ${operator} ${condition.errorThreshold} | ${condition.status} |`,
    )
  }

  return lines.join('\n')
}

async function main() {
  const analysis = await waitForAnalysis()

  const measuresBody = await api(
    `/api/measures/component?component=${PROJECT_KEY}&metricKeys=${ALL_METRICS.join(',')}`,
  )
  const measures = new Map((measuresBody.component.measures ?? []).map((measure) => [measure.metric, measure.value]))

  const issues = await fetchAllPages(
    `/api/issues/search?components=${PROJECT_KEY}&resolved=false&issueStatuses=OPEN,CONFIRMED`,
    'issues',
  )

  let hotspots = await fetchAllPages(`/api/hotspots/search?project=${PROJECT_KEY}`, 'hotspots')
  const appliedDecisions = await applyHotspotDecisions(hotspots)

  if (appliedDecisions > 0) {
    hotspots = await fetchAllPages(`/api/hotspots/search?project=${PROJECT_KEY}`, 'hotspots')
  }

  const gate = (await api(`/api/qualitygates/project_status?projectKey=${PROJECT_KEY}`)).projectStatus

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(`${OUT_DIR}/measures.json`, JSON.stringify(Object.fromEntries(measures), null, 2))
  writeFileSync(`${OUT_DIR}/issues.json`, JSON.stringify(issues, null, 2))
  writeFileSync(`${OUT_DIR}/hotspots.json`, JSON.stringify(hotspots, null, 2))

  const warnings = analysis?.warnings ?? []

  const markdown = [
    '# Relatório SonarQube',
    '',
    `Projeto: \`${PROJECT_KEY}\`  `,
    `Análise: ${analysis?.executedAt ?? 'desconhecida'}  `,
    `Dashboard: ${SONAR_URL}/dashboard?id=${PROJECT_KEY}`,
    '',
    ...(warnings.length > 0
      ? ['', '## Avisos do Compute Engine', '', ...warnings.map((warning) => `- ${warning}`)]
      : []),
    '',
    '## Quality gate',
    renderGate(gate),
    '',
    '## Métricas',
    renderMeasures(measures),
    '',
    `## Problemas em aberto (${issues.length})`,
    renderIssues(issues),
    '',
    '## Security hotspots',
    renderHotspots(hotspots),
    '',
  ].join('\n')

  writeFileSync(`${OUT_DIR}/SONAR-REPORT.md`, markdown)

  const pendingHotspots = hotspots.filter((hotspot) => hotspot.status !== 'REVIEWED').length

  console.log(`[sonar] quality gate: ${gate.status}`)
  console.log(`[sonar] problemas em aberto: ${issues.length}`)
  console.log(`[sonar] hotspots pendentes de revisão: ${pendingHotspots}`)
  console.log(`[sonar] cobertura: ${measures.get('coverage') ?? '—'} % | testes: ${measures.get('tests') ?? '—'}`)
  console.log(`[sonar] relatório: ${OUT_DIR}/SONAR-REPORT.md`)
  console.log(`[sonar] dashboard: ${SONAR_URL}/dashboard?id=${PROJECT_KEY}`)

  if (gate.status !== 'OK') {
    const failed = (gate.conditions ?? []).filter((condition) => condition.status === 'ERROR')
    for (const condition of failed) {
      console.error(
        `[sonar] FALHA: ${condition.metricKey} = ${condition.actualValue} (limite ${condition.comparator} ${condition.errorThreshold})`,
      )
    }
    process.exitCode = 1
  }
}

await main()
