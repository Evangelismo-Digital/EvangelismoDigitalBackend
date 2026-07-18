import { defineConfig } from 'prisma/config'
import 'dotenv/config'

const fallbackDatabaseUrl = '******localhost:5432/postgres?schema=public'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? fallbackDatabaseUrl,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
