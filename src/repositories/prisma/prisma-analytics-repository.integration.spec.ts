/**
 * Integration — the analytics repository against a real Docker Postgres,
 * running the same contract the in-memory double runs.
 *
 * This is what makes the double trustworthy. The upsert rules here are
 * asymmetric by design — first-touch visitor attribution must SURVIVE an
 * update while session attributes must be OVERWRITTEN by one, including being
 * cleared to null — and that asymmetry lives in a Prisma `upsert` payload where
 * it is invisible to any test that only exercises an array.
 *
 * Runs in CI: it needs Postgres but no Redis, BullMQ or HTTP.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll } from 'vitest'
import { prisma } from '@lib/prisma'
import { PrismaAnalyticsRepository } from './prisma-analytics-repository'
import { describeAnalyticsRepositoryContract } from '../analytics-repository.contract'

async function truncate() {
  // CASCADE reaches events and sessions through their foreign keys; visitors is
  // the root, so naming it alone would leave orphans behind for the next file.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE analytics_visitors, analytics_sessions, analytics_events, users CASCADE',
  )
}

beforeAll(async () => {
  await prisma.$connect()
})

afterAll(async () => {
  await truncate()
  await prisma.$disconnect()
})

describeAnalyticsRepositoryContract('Prisma + Postgres', {
  create: async () => {
    await truncate()
    return new PrismaAnalyticsRepository()
  },
  // `analytics_visitors.user_id` is a real foreign key to `users.public_id`, so
  // the row has to exist before anything can point at it.
  createLinkableUser: async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Analytics Contract User',
        username: `analytics-contract-${randomUUID()}`,
        email: `analytics-contract-${randomUUID()}@example.com`,
        cpf: randomUUID().slice(0, 11),
        passwordHash: 'not-a-real-hash',
      },
    })

    return user.publicId
  },
})
