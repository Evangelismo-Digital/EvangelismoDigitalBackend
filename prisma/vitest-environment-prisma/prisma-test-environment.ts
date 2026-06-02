import 'dotenv/config'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Environment } from 'vitest/environments'
import { prisma } from '../../src/lib/prisma/index.ts'

function generateDatabaseUrl(schema: string) {
  const baseUrl = process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL
  if (!baseUrl) {
    throw new Error('Please provide a DATABASE_URL or DATABASE_URL_LOCAL environment variable for the test database.')
  }

  const url = new URL(baseUrl)
  url.searchParams.set('schema', schema)
  url.searchParams.set('search_path', `${schema},public`)

  return url.toString()
}

export default <Environment>{
  name: 'prisma',
  viteEnvironment: 'ssr',
  async setup() {
    // Create a test database or run migrations here if needed

    const schema = `test_${randomUUID().replace(/-/g, '_')}`

    const databaseUrl = generateDatabaseUrl(schema)

    process.env.DATABASE_URL_LOCAL = databaseUrl
    process.env.DATABASE_URL = databaseUrl

    console.log(`Database URL for tests: ${databaseUrl}`)

    execSync('npx prisma db push', { stdio: 'inherit' })

    return {
      async teardown() {
        // Drop the test database or clean up resources here if needed
        await prisma.$executeRawUnsafe(`
                    DROP SCHEMA IF EXISTS "${schema}" CASCADE;   
                `)

        await prisma.$disconnect()
      },
    }
  },
}
