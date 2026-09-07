#!/usr/bin/env node
/**
 * Converts Vitest's JSON report into SonarQube's Generic Test Execution format.
 *
 * SonarQube has no native Vitest importer, and without this the dashboard shows
 * coverage but zero tests — which reads as "untested" to anyone looking at the
 * project, and silently drops the test-execution conditions of the quality
 * gate. The JUnit importer is Java-only, so the generic XML is the one path in.
 *
 * Usage: node scripts/vitest-to-sonar.mjs <vitest.json> <out.xml>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, relative, isAbsolute } from 'node:path'

const [inputPath, outputPath] = process.argv.slice(2)

if (!inputPath || !outputPath) {
  console.error('uso: node scripts/vitest-to-sonar.mjs <vitest.json> <out.xml>')
  process.exit(1)
}

const ROOT = process.cwd()

/** Control characters are illegal in XML 1.0 even when escaped, and a stack
 *  trace from a failed assertion routinely contains them. */
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

/** XML text nodes and attribute values must not carry raw markup delimiters. */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(ILLEGAL_XML_CHARS, '')
}

/** Sonar keys files by their path relative to the project base directory. */
function toRelative(filePath) {
  return isAbsolute(filePath) ? relative(ROOT, filePath) : filePath
}

function renderTestCase(assertion) {
  const name = escapeXml(assertion.fullName || assertion.title || 'unnamed')
  // Vitest reports null for a test that never ran; Sonar requires an integer.
  const duration = Math.max(0, Math.round(assertion.duration ?? 0))
  const open = `    <testCase name="${name}" duration="${duration}"`

  if (assertion.status === 'failed') {
    const message = escapeXml((assertion.failureMessages ?? []).join('\n') || 'failed')
    return `${open}>\n      <failure message="${message}"/>\n    </testCase>`
  }

  if (assertion.status === 'pending' || assertion.status === 'skipped' || assertion.status === 'todo') {
    return `${open}>\n      <skipped message="${escapeXml(assertion.status)}"/>\n    </testCase>`
  }

  return `${open}/>`
}

const report = JSON.parse(readFileSync(inputPath, 'utf8'))
const suites = report.testResults ?? []

/**
 * One <file> element per path. Vitest projects re-run the same spec file under
 * several project names (a file can belong to `unit-lib` and `unit-resilient-cache`
 * at once), and Sonar rejects a report that declares the same path twice.
 */
const byFile = new Map()

for (const suite of suites) {
  const path = toRelative(suite.name)
  const cases = byFile.get(path) ?? new Map()

  for (const assertion of suite.assertionResults ?? []) {
    // Same reason as above: keep the first result for a given test name so a
    // duplicated run does not double every count on the dashboard.
    const key = assertion.fullName || assertion.title
    if (!cases.has(key)) cases.set(key, assertion)
  }

  byFile.set(path, cases)
}

const body = [...byFile.entries()]
  .map(([path, cases]) => {
    const testCases = [...cases.values()].map(renderTestCase).join('\n')
    return `  <file path="${escapeXml(path)}">\n${testCases}\n  </file>`
  })
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testExecutions version="1">\n${body}\n</testExecutions>\n`

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, xml, 'utf8')

const fileCount = byFile.size
const caseCount = [...byFile.values()].reduce((total, cases) => total + cases.size, 0)
console.log(`sonar: ${caseCount} testes em ${fileCount} arquivos -> ${outputPath}`)
