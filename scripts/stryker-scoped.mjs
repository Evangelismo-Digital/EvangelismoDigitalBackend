#!/usr/bin/env node
/**
 * Layer 5, scoped to a diff — without silently mutating the test suite.
 *
 * Stryker's CLI `--mutate` REPLACES `mutate` from stryker.conf.mjs rather than
 * intersecting with it, and that array is where the exclusions live
 * (`!src/**\/*.spec.ts`, `!src/env/**`, ...). So the obvious command
 *
 *     npm run test:mutation -- --mutate "src/providers/**\/*.ts"
 *
 * quietly starts planting mutants in the spec files themselves. Nothing asserts
 * on a test's own source, so those mutants nearly all survive: measured on this
 * repo the provider chain scored 45.68 % that way versus 97.07 % once the
 * exclusions were restored — the same code, the same tests. The 85 % gate then
 * fails for a reason that has nothing to do with the change under test, and the
 * survivors it lists are lines in your own specs.
 *
 * This wrapper re-appends the negative patterns straight from the config, so
 * they cannot drift apart.
 *
 * Usage:
 *   npm run test:mutation:scoped -- "src/use-cases/users/**\/*.ts"
 *   npm run test:mutation:scoped -- "src/a/**\/*.ts" "src/b/**\/*.ts" -- --logLevel debug
 *
 * Everything after a bare `--` is forwarded to Stryker untouched.
 */
import { spawn } from 'node:child_process'
import strykerConfig from '../stryker.conf.mjs'

const argv = process.argv.slice(2)
const separator = argv.indexOf('--')
const globArgs = separator === -1 ? argv : argv.slice(0, separator)
const passthrough = separator === -1 ? [] : argv.slice(separator + 1)

// Accept both `a,b` and `a b`, so either habit works.
const globs = globArgs.flatMap((arg) => arg.split(',')).map((glob) => glob.trim()).filter(Boolean)

if (globs.length === 0) {
  console.error('uso: npm run test:mutation:scoped -- "<glob>" ["<glob>" ...] [-- <args do stryker>]')
  console.error('exemplo: npm run test:mutation:scoped -- "src/use-cases/users/**/*.ts"')
  process.exit(1)
}

const exclusions = strykerConfig.mutate.filter((pattern) => pattern.startsWith('!'))
const positives = globs.filter((glob) => !glob.startsWith('!'))
const extraExclusions = globs.filter((glob) => glob.startsWith('!'))

if (positives.length === 0) {
  console.error('[stryker] nenhum glob positivo informado — só exclusões.')
  process.exit(1)
}

const mutate = [...positives, ...exclusions, ...extraExclusions].join(',')

console.log(`[stryker] escopo: ${positives.join(', ')}`)
console.log(`[stryker] exclusões herdadas de stryker.conf.mjs: ${exclusions.join(', ')}`)

const child = spawn('npx', ['stryker', 'run', '--mutate', mutate, ...passthrough], {
  stdio: 'inherit',
  shell: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
