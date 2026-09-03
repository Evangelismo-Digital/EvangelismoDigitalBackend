/**
 * Layer 5 — Mutation Testing Gauntlet.
 *
 * Run scoped to the changed diff, e.g.:
 *   npx stryker run --incremental --mutate "src/use-cases/outbox-event/**\/*.ts"
 *
 * `thresholds.break` enforces the "mutation score >= 85% on the modified diff"
 * rule for scoped runs. A full unscoped `npm run test:mutation` is a report, not
 * a gate, and may legitimately sit below 85 on untested legacy code.
 */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  // Dedicated config: fast hermetic unit specs only (no Docker / live-API e2e).
  vitest: { configFile: 'vitest.stryker.config.mts' },
  mutate: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.acceptance.spec.mts',
    '!src/**/*.d.ts',
    '!src/server.ts',
    '!src/worker.ts',
    '!src/env/**',
    '!src/@types/**',
    '!src/templates/**',
  ],
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  incremental: true,
  incrementalFile: 'reports/mutation/stryker-incremental.json',
  thresholds: { high: 90, low: 80, break: 85 },
}
