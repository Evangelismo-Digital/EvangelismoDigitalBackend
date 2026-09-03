import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Config used ONLY by Stryker (Layer 5). It runs the fast, hermetic unit specs
 * — no Docker, no live-API e2e, no Gherkin acceptance layer. The main
 * `vite.config.mts` project list is not reusable here because the Stryker
 * vitest-runner has no `--project` filter; keep the exclude list below in sync
 * with the e2e / acceptance projects there.
 */
export default defineConfig(({ mode }) => ({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    dir: 'src',
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
    include: ['src/**/*.spec.ts'],
    exclude: [
      '**/node_modules/**',
      'src/http/controllers/**/*.e2e.spec.ts',
      'src/http/controllers/**/*.acceptance.spec.mts',
      '**/api-providers-fallback-strategy*',
      // Integration suites need a real Redis/Postgres and are parallel-hostile.
      // Stryker runs many workers at once over one keyspace, which made the
      // dry run fail intermittently; mutation testing is a unit-level gate.
      '**/*.integration.spec.ts',
      '**/*.redis-integration.spec.ts',
    ],
  },
}))
