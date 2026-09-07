#!/usr/bin/env node
/**
 * Provisions the SonarQube instance: quality profiles, rule parameters and the
 * quality gate.
 *
 * All of it lives in code rather than in the server's database because a
 * SonarQube volume is disposable — `npm run sonar:reset` throws it away, CI
 * starts from an empty one — and a gate that only exists on one developer's
 * machine gates nothing. Every call is idempotent: running this against an
 * already-configured instance is a no-op that reports what it found.
 *
 * Usage: node scripts/sonar-configure.mjs
 * Env:   SONAR_URL (default http://localhost:9000)
 *        credentials read from .sonar/admin-password
 */
import { readFileSync } from 'node:fs'

const SONAR_URL = process.env.SONAR_URL ?? 'http://localhost:9000'
const PROJECT_KEY = 'evangelismo-digital-backend'
const PROJECT_NAME = 'Evangelismo Digital Backend'
const PROFILE_NAME = 'Evangelismo Way'
const GATE_NAME = 'Evangelismo Strict'

/**
 * The languages whose rules are turned all the way up. `ts` and `js` are the
 * source; `secrets` scans every file for credential patterns; `docker` and
 * `yaml` cover the Dockerfile and the compose stacks, which are as much a
 * security surface as the application code.
 */
const LANGUAGES = ['ts', 'js', 'secrets', 'docker', 'yaml']

/**
 * Rule parameters aligned with the ESLint gate, so a function cannot be legal
 * in one tool and illegal in the other. Where the two overlap the numbers are
 * identical on purpose (see eslint.config.mjs, Layer 4).
 */
const RULE_PARAMS = [
  // Cognitive complexity — the metric SonarQube reports on its dashboard. It
  // weights nesting, so it catches what plain cyclomatic complexity misses.
  { rule: 'typescript:S3776', params: 'threshold=10' },
  { rule: 'javascript:S3776', params: 'threshold=10' },
  // Cyclomatic complexity per function; matches ESLint `complexity: 6`.
  { rule: 'typescript:S1541', params: 'maximumFunctionComplexityThreshold=6' },
  { rule: 'javascript:S1541', params: 'maximumFunctionComplexityThreshold=6' },
  // Function length; matches ESLint `max-lines-per-function: 30`.
  { rule: 'typescript:S138', params: 'max=30' },
  { rule: 'javascript:S138', params: 'max=30' },
  // Parameter count; matches ESLint `max-params: 5`.
  { rule: 'typescript:S107', params: 'max=5' },
  { rule: 'javascript:S107', params: 'max=5' },
  // Nesting depth; matches ESLint `max-depth: 3`.
  { rule: 'typescript:S134', params: 'maximumNestingLevel=3' },
  { rule: 'javascript:S134', params: 'maximumNestingLevel=3' },
  // File length. 400 lines is roughly the largest module in the tree today;
  // above that a file has stopped being one unit of thought.
  { rule: 'typescript:S104', params: 'maximumFileLocThreshold=400' },
  { rule: 'javascript:S104', params: 'maximumFileLocThreshold=400' },
  // Function naming. The default regex is camelCase-only, which misreads this
  // codebase's registries: `AppErrorRegistry`, the Prisma error-mapping tables
  // and the message catalogues are objects keyed by an error CODE, and the
  // value happens to be a factory function. Those keys are constants and are
  // meant to shout. Widening the pattern to accept UPPER_SNAKE keeps the rule
  // working on real function names instead of turning it off.
  { rule: 'typescript:S100', params: 'format=^([_a-z][a-zA-Z0-9]*|[A-Z][A-Z0-9_]*)$' },
  { rule: 'javascript:S100', params: 'format=^([_a-z][a-zA-Z0-9]*|[A-Z][A-Z0-9_]*)$' },
  // Union size. The default of 3 is aimed at a union that should have been a
  // class hierarchy; it also catches two shapes that legitimately need more —
  // a recursive JSON payload type (`string | number | boolean | null |
  // FormPayload | FormPayload[]`) and the implementation signature of a
  // four-overload function. Six admits both and still catches a sprawl.
  { rule: 'typescript:S4622', params: 'threshold=6' },
]

/**
 * Rules switched back off after the bulk activation, each with the reason.
 *
 * Deactivating in the profile — rather than resolving thousands of issues as
 * "won't fix" in the UI — is what keeps the configuration reproducible: the
 * reason is in git, and a fresh instance comes up with the same decision.
 */
const RULE_EXCLUSIONS = [
  {
    rules: ['typescript:S1451', 'javascript:S1451'],
    reason: 'Exige cabeçalho de copyright em todo arquivo; o projeto usa LICENSE.txt na raiz.',
  },
  {
    rules: ['typescript:S1226', 'javascript:S1226'],
    reason:
      'Proíbe reatribuir parâmetros; já coberto (e melhor calibrado) pelo `no-param-reassign` do ESLint, que permite mutação de propriedades.',
  },
  {
    rules: ['typescript:S2762', 'javascript:S2762'],
    reason: 'Regra depreciada no próprio SonarQube.',
  },
  {
    rules: ['typescript:S3524', 'javascript:S3524'],
    reason:
      'Exige remover os parênteses do parâmetro de arrow functions — exatamente o oposto do que o Prettier (arrowParens: "always", .prettierrc.json) escreve. Manter as duas ativas cria um conflito insolúvel: o formatador desfaz a correção em todo save. Formatação pertence ao Prettier.',
  },
  {
    rules: ['typescript:S1774', 'javascript:S1774'],
    reason:
      'Proíbe QUALQUER operador ternário. Não é um smell neste código: os 94 usos são expressões de uma linha (`isDev ? a : b`), e transformá-los em if/else aumentaria a complexidade ciclomática que a S1541 mede — as duas regras se contradizem.',
  },
  {
    rules: ['typescript:S121', 'javascript:S121'],
    reason:
      'Exige chaves em todo `if`. Conflita com o idioma central do repositório, o guard do padrão Result (`if (isErr(result)) return result`), documentado no CLAUDE.md e usado em ~34 pontos. Envolvê-los em chaves dobra as linhas dos guards sem tornar nenhum deles mais claro.',
  },
  {
    rules: ['typescript:S2138', 'javascript:S2138'],
    reason:
      'Manda usar `null` no lugar de `undefined`. Contradiz uma decisão de arquitetura explícita: os contratos de domínio declaram `Date | undefined` (ver IOutboxEvent) e o repositório Prisma converte na fronteira (`raw.sendingAt || undefined`, `expiresAt: data.expiresAt ?? null`). `null` é vocabulário do banco; `undefined` é o do domínio. Aplicar a regra inverteria a convenção em todo o tree, inclusive na conversão que a torna coerente.',
  },
  {
    rules: ['typescript:S4326', 'javascript:S4326'],
    reason:
      'Manda remover `await` de um `return await` fora de try/catch. Mesma decisão tomada no ESLint (`return-await: error-handling-correctness-only`): remover os 27 awaits mexe em fronteiras de microtask de código que funciona, e este repositório já perdeu a deduplicação single-flight uma vez exatamente por isso (CLAUDE.md). O defeito real — `return` de promise DENTRO de try — continua sendo pego pelo ESLint.',
  },
]

const password = readFileSync('.sonar/admin-password', 'utf8').trim()
const auth = 'Basic ' + Buffer.from(`admin:${password}`).toString('base64')

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
  const options = { method, headers: { Authorization: auth } }

  if (form) {
    options.body = new URLSearchParams(form)
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  const response = await fetchWithRetry(`${SONAR_URL}${path}`, options)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 400)}`)
  }

  return text ? JSON.parse(text) : {}
}

/** POSTs that are expected to fail when the thing already exists. */
async function apiTolerant(path, options) {
  try {
    return { ok: true, body: await api(path, options) }
  } catch (error) {
    return { ok: false, error }
  }
}

async function ensureProject() {
  const found = await api(`/api/projects/search?projects=${PROJECT_KEY}`)

  if (found.components.length > 0) {
    return 'já existia'
  }

  await api('/api/projects/create', {
    method: 'POST',
    form: { project: PROJECT_KEY, name: PROJECT_NAME, mainBranch: 'main' },
  })

  return 'criado'
}

async function findProfile(language, name) {
  const { profiles } = await api(`/api/qualityprofiles/search?language=${language}`)
  return profiles.find((profile) => profile.name === name)
}

/** Copies "Sonar way" once, then reuses the copy on every later run. */
async function ensureProfile(language) {
  const existing = await findProfile(language, PROFILE_NAME)
  if (existing) return existing

  const sonarWay = await findProfile(language, 'Sonar way')
  if (!sonarWay) throw new Error(`perfil "Sonar way" não encontrado para ${language}`)

  await api('/api/qualityprofiles/copy', {
    method: 'POST',
    form: { fromKey: sonarWay.key, toName: PROFILE_NAME },
  })

  const copied = await findProfile(language, PROFILE_NAME)
  if (!copied) throw new Error(`falha ao copiar o perfil para ${language}`)

  return copied
}

/**
 * Activates every non-deprecated rule the language has.
 *
 * `statuses=READY` is the important filter: SonarQube still ships rules it has
 * itself deprecated, and turning those on would contradict the repo's own ban
 * on deprecated code — it would police the source with advice the vendor has
 * withdrawn.
 */
async function activateAllRules(profile) {
  await api('/api/qualityprofiles/activate_rules', {
    method: 'POST',
    form: {
      targetKey: profile.key,
      qprofile: profile.key,
      activation: 'false',
      languages: profile.language,
      statuses: 'READY',
    },
  })
}

async function applyRuleParams(profileByLanguage) {
  let applied = 0

  for (const { rule, params } of RULE_PARAMS) {
    const language = rule.startsWith('typescript:') ? 'ts' : 'js'
    const profile = profileByLanguage.get(language)
    if (!profile) continue

    const result = await apiTolerant('/api/qualityprofiles/activate_rule', {
      method: 'POST',
      form: { key: profile.key, rule, params },
    })

    if (result.ok) applied += 1
    else console.warn(`  aviso: não foi possível parametrizar ${rule}: ${result.error.message.slice(0, 120)}`)
  }

  return applied
}

async function applyRuleExclusions(profileByLanguage) {
  let removed = 0

  for (const { rules } of RULE_EXCLUSIONS) {
    for (const rule of rules) {
      const language = rule.startsWith('typescript:') ? 'ts' : 'js'
      const profile = profileByLanguage.get(language)
      if (!profile) continue

      const result = await apiTolerant('/api/qualityprofiles/deactivate_rule', {
        method: 'POST',
        form: { key: profile.key, rule },
      })

      if (result.ok) removed += 1
    }
  }

  return removed
}

/**
 * The gate conditions.
 *
 * Both halves matter. The `new_*` conditions are the ones a pull request is
 * judged by; the overall ones stop the project from carrying a growing debt
 * that never counts as "new". Ratings are 1 = A.
 *
 * The `software_quality_*` family (not the legacy `sqale_rating` /
 * `reliability_rating` names) because this instance runs in Multi-Quality Rule
 * mode, where those are the ratings the UI and the issue model actually use.
 */
const GATE_CONDITIONS = [
  // New code — what a pull request is judged by.
  { metric: 'new_violations', op: 'GT', error: '0' },
  { metric: 'new_coverage', op: 'LT', error: '80' },
  { metric: 'new_duplicated_lines_density', op: 'GT', error: '3' },
  { metric: 'new_software_quality_reliability_rating', op: 'GT', error: '1' },
  { metric: 'new_software_quality_security_rating', op: 'GT', error: '1' },
  { metric: 'new_software_quality_maintainability_rating', op: 'GT', error: '1' },
  { metric: 'new_security_hotspots_reviewed', op: 'LT', error: '100' },
  // Overall code — stops debt that is never "new" from accumulating.
  { metric: 'violations', op: 'GT', error: '0' },
  { metric: 'coverage', op: 'LT', error: '80' },
  { metric: 'duplicated_lines_density', op: 'GT', error: '3' },
  { metric: 'software_quality_reliability_rating', op: 'GT', error: '1' },
  { metric: 'software_quality_security_rating', op: 'GT', error: '1' },
  { metric: 'software_quality_maintainability_rating', op: 'GT', error: '1' },
  { metric: 'security_review_rating', op: 'GT', error: '1' },
]

async function ensureGate() {
  const { qualitygates } = await api('/api/qualitygates/list')
  let gate = qualitygates.find((candidate) => candidate.name === GATE_NAME)

  if (!gate) {
    gate = await api('/api/qualitygates/create', { method: 'POST', form: { name: GATE_NAME } })
  }

  const details = await api(`/api/qualitygates/show?name=${encodeURIComponent(GATE_NAME)}`)
  const byMetric = new Map((details.conditions ?? []).map((condition) => [condition.metric, condition]))

  // Prune BEFORE adding. SonarQube rejects a condition whose metric is
  // "equivalent" to one already on the gate — the legacy `reliability_rating`
  // and the Multi-Quality-Rule `software_quality_reliability_rating` are the
  // same condition to it — so a stale legacy condition left in place would
  // block its own replacement.
  for (const [metric, condition] of byMetric) {
    if (!GATE_CONDITIONS.some((wanted) => wanted.metric === metric)) {
      await apiTolerant('/api/qualitygates/delete_condition', { method: 'POST', form: { id: condition.id } })
      byMetric.delete(metric)
    }
  }

  for (const condition of GATE_CONDITIONS) {
    const existing = byMetric.get(condition.metric)

    if (!existing) {
      await api('/api/qualitygates/create_condition', {
        method: 'POST',
        form: { gateName: GATE_NAME, metric: condition.metric, op: condition.op, error: condition.error },
      })
      continue
    }

    if (existing.op !== condition.op || existing.error !== condition.error) {
      await api('/api/qualitygates/update_condition', {
        method: 'POST',
        form: { id: existing.id, metric: condition.metric, op: condition.op, error: condition.error },
      })
    }
  }

  await apiTolerant('/api/qualitygates/select', {
    method: 'POST',
    form: { gateName: GATE_NAME, projectKey: PROJECT_KEY },
  })

  return gate
}

/**
 * "New code" is every change since the previous analysis.
 *
 * The alternative (a fixed reference branch) would make the whole working tree
 * count as new on a machine that has only ever analysed one commit, and the
 * new-code half of the gate would then just restate the overall half.
 */
async function setNewCodeDefinition() {
  await apiTolerant('/api/new_code_periods/set', {
    method: 'POST',
    form: { project: PROJECT_KEY, type: 'PREVIOUS_VERSION' },
  })
}

async function main() {
  console.log(`configurando SonarQube em ${SONAR_URL}`)

  console.log(`  projeto: ${await ensureProject()}`)

  const profileByLanguage = new Map()

  for (const language of LANGUAGES) {
    const profile = await ensureProfile(language)
    await activateAllRules(profile)

    const refreshed = await findProfile(language, PROFILE_NAME)
    await api('/api/qualityprofiles/set_default', {
      method: 'POST',
      form: { language, qualityProfile: PROFILE_NAME },
    })

    profileByLanguage.set(language, refreshed)
    console.log(`  perfil ${language}: ${refreshed.activeRuleCount} regras ativas (padrão)`)
  }

  console.log(`  parâmetros de regra aplicados: ${await applyRuleParams(profileByLanguage)}/${RULE_PARAMS.length}`)
  console.log(`  regras desativadas por decisão do projeto: ${await applyRuleExclusions(profileByLanguage)}`)

  await ensureGate()
  console.log(`  quality gate "${GATE_NAME}": ${GATE_CONDITIONS.length} condições`)

  await setNewCodeDefinition()
  console.log('  new code period: PREVIOUS_VERSION')
}

await main()
