import { defineConfig } from 'prisma/config'
import { env } from './src/env/index'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env.DATABASE_URL_LOCAL ?? env.DATABASE_URL,
    shadowDatabaseUrl: env.SHADOW_DATABASE_URL,
  },
})
