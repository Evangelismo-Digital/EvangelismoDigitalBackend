import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [tsconfigPaths()],
    test: {
      globals: true,
      dir: 'src',
      environment: 'node',
      env: env,
      coverage: {
        provider: 'v8',
        reportsDirectory: 'coverage',
        // `lcov` is what SonarQube reads (scripts/sonar.sh); the JSON reporters
        // are what scripts/ci-local.sh and the CI summary read. Listing them
        // here rather than only on the command line means a plain
        // `npm run test:coverage` produces a report Sonar can ingest too.
        reporter: ['text', 'json', 'json-summary', 'lcov'],
        // Coverage of a file nobody imported is 0 %, and that is the honest
        // number: without this a module that lost its last test silently drops
        // out of the denominator instead of showing up as uncovered.
        all: true,
        include: ['src/**/*.ts'],
        exclude: [
          'src/**/*.spec.ts',
          'src/**/*.spec.mts',
          'src/**/*.contract.ts',
          'src/generated/**',
          'src/load-test/**',
          'src/@types/**',
          // Type-only modules compile to nothing, so V8 reports them as 0 %
          // of 0 lines and they distort the average without carrying logic.
          'src/core/contracts/**',
          'src/core/types/**',
        ],
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'unit-core',
            dir: 'src/core',
            include: ['**/*.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-providers-helpers',
            dir: 'src/providers/helpers',
            include: ['**/*.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-errors',
            dir: 'src/errors',
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-use-cases',
            dir: 'src/use-cases',
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-churches',
            dir: 'src/use-cases/churches',
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-users',
            dir: 'src/use-cases/users',
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-messaging',
            dir: 'src/use-cases/messaging',
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-forms',
            dir: 'src/use-cases/forms',
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-geo-provider',
            dir: 'src/providers/geo-provider',
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-address-provider',
            dir: 'src/providers/address-provider',
            include: ['**/*.spec.ts'],
            exclude: ['**/*.integration.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-http',
            dir: 'src/http',
            include: [
              'plugins/**/*.spec.ts',
              'presenters/**/*.spec.ts',
              'middlewares/**/*.spec.ts',
              'cookies/**/*.spec.ts',
              // Church controllers: the users ones have their own project.
              'controllers/churches/**/*.spec.ts',
              'controllers/analytics/**/*.spec.ts',
            ],
            exclude: ['**/*.e2e.spec.ts', '**/*.acceptance.spec.mts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-http-users',
            dir: 'src/http/controllers/users',
            environment: 'node',
            include: ['**/*.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-church-routing-provider',
            dir: 'src/providers/church-routing-provider',
            include: ['**/*.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-lib',
            dir: 'src/lib',
            include: ['**/*.spec.ts'],
            exclude: ['**/*.integration.spec.ts', '**/*.redis-integration.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-resilient-cache',
            dir: 'src/lib/infra/cache',
            include: ['**/*.spec.ts'],
            exclude: ['**/*.integration.spec.ts', '**/*.redis-integration.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-rate-limiter',
            dir: 'src/lib/infra/rate-limiter',
            include: ['**/*.spec.ts'],
            exclude: ['**/*.integration.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-repositories',
            dir: 'src/repositories',
            include: ['**/*.spec.ts'],
            // Without this, `prisma-churches-repository.integration.spec.ts` is
            // collected here — a "unit" project that needs Docker Postgres, and
            // the reason `npm run test:unit:all` (which the pre-commit hook runs
            // and documents as Docker-free) failed the moment the DB container
            // stopped. Its own `integration` project still runs it.
            exclude: ['**/*.integration.spec.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'e2e',
            dir: 'src/http/controllers',
            // Explicit: without it this defaults to every `*.spec.ts` under
            // controllers, so plain unit specs colocated with a controller get
            // dragged through the Docker Prisma environment as well as their
            // own project — slower, and coupling a unit test to a container.
            include: ['**/*.e2e.spec.ts'],
            exclude: [
              '**/api-providers-fallback-strategy.e2e.spec.ts',
              '**/*.acceptance.spec.mts',
              // Opt-in integration suite (own `integration` project, not in CI).
              '**/*.integration.spec.ts',
            ],
            // Uses Docker database with public schema
            environment: './prisma/vitest-environment-prisma/prisma-docker-environment.ts',
          },
        },
        {
          extends: true,
          test: {
            // Layer 1 — Acceptance (Gherkin). `.feature` files under features/,
            // step definitions colocated as *.acceptance.spec.ts, driven through
            // Vitest by @amiceli/vitest-cucumber over the HTTP boundary.
            name: 'acceptance',
            dir: 'src/http/controllers',
            // ESM (.mts) — @amiceli/vitest-cucumber is an ESM-only package.
            include: ['**/*.acceptance.spec.mts'],
            // Uses Docker database with public schema
            environment: './prisma/vitest-environment-prisma/prisma-docker-environment.ts',
          },
        },
        {
          extends: true,
          test: {
            name: 'e2e-api-providers-fallback-strategy',
            include: ['**/api-providers-fallback-strategy.e2e.spec.ts'],
            // Uses Docker database with public schema (no isolation)
            environment: './prisma/vitest-environment-prisma/prisma-docker-environment.ts',
          },
        },
        {
          extends: true,
          test: {
            name: 'e2e-users',
            dir: 'src/http/controllers/users',
            environment: './prisma/vitest-environment-prisma/prisma-docker-environment.ts',
          },
        },
        {
          extends: true,
          test: {
            // Redis-only integration suite for the cache layer. Deliberately
            // separate from `integration`: it needs no Postgres, no Prisma
            // environment and none of the BullMQ / pub-sub singletons, so it is
            // cheap enough to run in CI on every push. Listed in BOTH the
            // ci.yml and scripts/ci-local.sh allowlists — keep them in lockstep.
            name: 'integration-cache',
            dir: 'src/lib/infra/cache',
            include: ['**/*.redis-integration.spec.ts'],
            // One shared Redis keyspace; parallel files would collide.
            fileParallelism: false,
            hookTimeout: 30_000,
            testTimeout: 20_000,
          },
        },
        {
          extends: true,
          test: {
            // Postgres-only integration suite for the repositories. Split out of
            // `unit-repositories` — where it had been running as if it were a
            // unit test — but kept in the CI allowlist, because dropping it there
            // would have traded real coverage of the PostGIS queries for local
            // ergonomics. Cheap enough for CI for the same reason
            // `integration-cache` is: no Redis, no BullMQ singletons, no HTTP.
            // Listed in BOTH the ci.yml and scripts/ci-local.sh allowlists —
            // keep them in lockstep.
            name: 'integration-repositories',
            dir: 'src/repositories',
            include: ['**/*.integration.spec.ts'],
            environment: './prisma/vitest-environment-prisma/prisma-docker-environment.ts',
            // One shared schema; parallel files would truncate each other.
            fileParallelism: false,
            hookTimeout: 30_000,
            testTimeout: 20_000,
          },
        },
        {
          extends: true,
          test: {
            // Opt-in integration suite: real Docker Postgres + Redis, external
            // HTTP (geocoding/address APIs) and SMTP stubbed at the client
            // boundary. NOT in the CI allowlist or scripts/ci-local.sh — run
            // locally with the compose stack up: `npm run test:integration:full`.
            name: 'integration',
            dir: 'src',
            include: ['**/*.integration.spec.ts'],
            environment: './prisma/vitest-environment-prisma/prisma-docker-environment.ts',
            // Real Redis pub/sub + BullMQ + Fastify singletons don't tolerate
            // parallel files sharing one Redis keyspace; run serially.
            fileParallelism: false,
            hookTimeout: 30_000,
            testTimeout: 20_000,
          },
        },
      ],
    },
  }
})
