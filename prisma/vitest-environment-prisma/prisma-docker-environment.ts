import 'dotenv/config'
import type { Environment } from 'vitest/environments'
import { prisma } from '../../src/infra/database/prisma/index.ts'

export default <Environment>{
  name: 'prisma-docker',
  viteEnvironment: 'ssr',
  async setup() {
    // Use Docker database with public schema (no unique schema generation)
    const databaseUrl =
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/evangelismodigital?schema=public'

    process.env.DATABASE_URL = databaseUrl

    console.log(`Using Docker database for geo-fallback tests: ${databaseUrl}`)

    return {
      async teardown() {
        // Don't drop schema, just disconnect
        await prisma.$disconnect()
      },
    }
  },
}
