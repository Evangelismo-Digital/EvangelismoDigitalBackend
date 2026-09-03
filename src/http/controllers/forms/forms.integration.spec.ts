/**
 * Integration — POST /forms/submit-form against a real Docker Postgres.
 * Covers HTTP validation, the form + outbox write committed in one transaction,
 * the duplicate-email conflict, and transactional rollback on an outbox failure.
 *
 * Opt-in: `npm run test:integration:full` with the compose stack up. Not in CI.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

const { publishNewItem } = vi.hoisted(() => ({ publishNewItem: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@lib/infra/events/outbox-signal', () => ({ OutboxSignal: { publishNewItem } }))

import { app } from 'app'
import { prisma } from '@lib/prisma'
import { closeAllRedisConnections } from '@lib/redis/clients/clients'
import { PrismaOutboxRepository } from '@repositories/prisma/prisma-outbox-event-repository'
import { err } from 'core/shared/result'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { OUTBOX_EVENT_TYPES } from 'core/types/outbox/outbox-event-input'

const VALID = {
  name: 'Maria',
  lastName: 'Souza',
  email: 'forms-it@example.com',
  decisaoPorCristo: true,
  location: 'Recife, PE',
}

async function wipe() {
  await prisma.formSubmission.deleteMany({ where: { email: { contains: 'forms-it' } } })
  await prisma.outboxEvent.deleteMany({ where: { type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED } })
}

beforeAll(async () => {
  await app.ready()
})

beforeEach(async () => {
  vi.clearAllMocks()
  publishNewItem.mockResolvedValue(undefined)
  await wipe()
})

afterEach(async () => {
  await wipe()
})

afterAll(async () => {
  await app.close()
  await closeAllRedisConnections() // rate-limit plugin holds getRedisRateLimit()
  await prisma.$disconnect()
})

describe('POST /forms/submit-form (integration, real Postgres)', () => {
  it('201 → persists the form row and a PENDING outbox event in the same transaction', async () => {
    const res = await request(app.server).post('/forms/submit-form').set('x-forwarded-for', '198.51.100.10').send(VALID)

    expect(res.statusCode).toBe(201)
    expect(res.body.sanitizedFormSubmission).toMatchObject({
      name: 'Maria',
      lastName: 'Souza',
      email: 'forms-it@example.com',
      decisaoPorCristo: true,
      location: 'Recife, PE',
    })

    const form = await prisma.formSubmission.findUnique({ where: { email: 'forms-it@example.com' } })
    expect(form).not.toBeNull()
    expect(form?.ipAddress).toBeTruthy() // request.ip captured server-side

    const events = await prisma.outboxEvent.findMany({
      where: { type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED },
    })
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('PENDING')
    // ipAddress is deliberately kept out of the persisted outbox payload.
    expect(JSON.stringify(events[0].payload)).not.toContain('198.51.100.10')
    expect((events[0].payload as Record<string, unknown>).email).toBe('forms-it@example.com')
  })

  it('publishes the outbox wakeup signal after commit with the created event', async () => {
    await request(app.server)
      .post('/forms/submit-form')
      .set('x-forwarded-for', '198.51.100.11')
      .send({
        ...VALID,
        email: 'forms-it-signal@example.com',
      })

    expect(publishNewItem).toHaveBeenCalledTimes(1)
    const [publicId, event] = publishNewItem.mock.calls[0]
    expect(typeof publicId).toBe('string')
    expect(event.type).toBe(OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED)
    expect(event.status).toBe('PENDING')
  })

  it('409 on a duplicate email and writes no second row', async () => {
    await request(app.server).post('/forms/submit-form').set('x-forwarded-for', '198.51.100.12').send(VALID)
    const dup = await request(app.server)
      .post('/forms/submit-form')
      .set('x-forwarded-for', '198.51.100.12')
      .send({ ...VALID, name: 'Outra', lastName: 'Pessoa' })

    expect(dup.statusCode).toBe(409)
    expect(dup.body.code).toBe('FORM_ALREADY_EXISTS')

    expect(await prisma.formSubmission.count({ where: { email: 'forms-it@example.com' } })).toBe(1)
    expect(await prisma.outboxEvent.count({ where: { type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED } })).toBe(1)
  })

  it.each([
    ['name too short', { ...VALID, name: 'ab' }],
    ['invalid email', { ...VALID, email: 'not-an-email' }],
    ['missing decisaoPorCristo', { name: 'Maria', lastName: 'Souza', email: 'forms-it-x@example.com' }],
  ])('400 on %s and touches neither table', async (_label, payload) => {
    const res = await request(app.server)
      .post('/forms/submit-form')
      .set('x-forwarded-for', '198.51.100.13')
      .send(payload)

    expect(res.statusCode).toBe(400)
    expect(await prisma.formSubmission.count({ where: { email: { contains: 'forms-it' } } })).toBe(0)
    expect(await prisma.outboxEvent.count({ where: { type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED } })).toBe(0)
  })

  it('rolls the whole transaction back when the outbox insert fails — no orphan form row', async () => {
    const spy = vi
      .spyOn(PrismaOutboxRepository.prototype, 'create')
      .mockResolvedValue(err(new DatabaseQueryError(new Error('injected outbox failure'))))

    const res = await request(app.server)
      .post('/forms/submit-form')
      .set('x-forwarded-for', '198.51.100.14')
      .send({ ...VALID, email: 'forms-it-rollback@example.com' })

    expect(spy).toHaveBeenCalled()
    expect(res.statusCode).toBeGreaterThanOrEqual(500)

    // The form insert happened inside the same tx and must have been rolled back.
    expect(await prisma.formSubmission.findUnique({ where: { email: 'forms-it-rollback@example.com' } })).toBeNull()
    expect(publishNewItem).not.toHaveBeenCalled()

    spy.mockRestore()
  })
})
