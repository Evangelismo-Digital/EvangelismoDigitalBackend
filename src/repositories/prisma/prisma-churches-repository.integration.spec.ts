/**
 * Integration — the churches repository against a real Docker Postgres +
 * PostGIS, running the shared contract that the in-memory double also runs.
 *
 * This is what makes the double trustworthy: the same scenarios execute against
 * both, so `lower(trim(...))`, the `name OR (lat AND lon)` duplicate rule and
 * the six-decimal coordinate rounding are verified rather than transcribed.
 *
 * Opt-in: `npm run test:integration:full` with the compose stack up. Not in CI.
 */
import { beforeAll, afterAll } from 'vitest'
import { prisma } from '@lib/prisma'
import { PrismaChurchesRepository } from './prisma-churches-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from './errors/churches-error-mapping'
import { describeChurchesRepositoryContract } from '../churches-repository.contract'

beforeAll(async () => {
  await prisma.$connect()
})

afterAll(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE churches RESTART IDENTITY CASCADE')
  await prisma.$disconnect()
})

describeChurchesRepositoryContract('Prisma + PostGIS', {
  create: async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE churches RESTART IDENTITY CASCADE')
    return new PrismaChurchesRepository(new PrismaErrorMapper(churchPrismaErrorMapping))
  },
})
