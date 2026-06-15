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
      projects: [
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
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-http',
            dir: 'src/http',
            include: ['plugins/**/*.spec.ts'],
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
            name: 'unit-resilient-cache',
            dir: 'src/lib/infra/cache',
          },
        },
        {
          extends: true,
          test: {
            name: 'unit-rate-limiter',
            dir: 'src/lib/infra/rate-limiter',
          },
        },
        {
          extends: true,
          test: {
            name: 'e2e',
            dir: 'src/http/controllers',
            exclude: ['**/api-providers-fallback-strategy.e2e.spec.ts'],
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
      ],
    },
  }
})
