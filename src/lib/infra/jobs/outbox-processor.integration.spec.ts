/**
 * Integration — OutboxProcessor against a real Docker Postgres + real Redis
 * (distributed lock). BullMQ enqueue is spied so no worker is needed.
 *
 * Opt-in: `npm run test:integration:full` with the compose stack up. Not in CI.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Queue } from 'bullmq'
import { OutboxProcessor } from './outbox-processor'
import { makeOutboxDispatchStrategyRegistry } from './make-outbox-dispatch-registry'
import { PrismaOutboxRepository } from '@repositories/prisma/prisma-outbox-event-repository'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@repositories/prisma/errors/outbox-error-mapping'
import { DistributedLock } from '@lib/infra/distributed-lock/distributed-lock'
import { getMailQueue } from '@lib/queue/mail-queue'
import { getRedisCache, closeAllRedisConnections } from '@lib/redis/clients/clients'
import { prisma } from '@lib/prisma'
import { OUTBOX_EVENT_TYPES } from 'core/types/outbox/outbox-event-input'
import { OUTBOX_CONSTANTS } from 'messages/constants/outbox/outbox'
import { QUEUE } from 'messages/constants/queue/queue'

const PROCESSOR_LOCK = OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_PROCESSOR

function makeProcessor() {
  const dbContext = new DatabaseContext()
  const repo = new PrismaOutboxRepository(
    dbContext,
    new PrismaErrorMapper(outboxHttpPrismaErrorMapping),
    new PrismaErrorMapper(outboxInfraPrismaErrorMapping),
  )
  return new OutboxProcessor(repo, makeOutboxDispatchStrategyRegistry())
}

const CONTACT_PAYLOAD = {
  name: 'Maria',
  lastName: 'Souza',
  email: 'outbox-it@example.com',
  decisaoPorCristo: false,
}

let queue: Queue
let addSpy: ReturnType<typeof vi.spyOn>

async function wipe() {
  await prisma.outboxEvent.deleteMany({ where: { type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED } })
  await getRedisCache().del(PROCESSOR_LOCK, OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY)
}

beforeAll(async () => {
  queue = getMailQueue()
})

beforeEach(async () => {
  await wipe()
  addSpy = vi.spyOn(queue, 'add').mockResolvedValue({ id: 'job-1' } as never)
})

afterEach(async () => {
  addSpy.mockRestore()
  await wipe()
})

afterAll(async () => {
  await queue.close()
  await closeAllRedisConnections()
})

describe('OutboxProcessor (integration, real Postgres + Redis lock)', () => {
  it('picks up a PENDING event, flips it to SENDING and enqueues a BullMQ job keyed by publicId', async () => {
    const row = await prisma.outboxEvent.create({
      data: { type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED, status: 'PENDING', payload: CONTACT_PAYLOAD },
    })

    await makeProcessor().processPendingEvents()

    const after = await prisma.outboxEvent.findUnique({ where: { publicId: row.publicId } })
    expect(after?.status).toBe('SENDING')
    expect(after?.attempts).toBe(1)
    expect(after?.sendingAt).not.toBeNull()

    expect(addSpy).toHaveBeenCalledTimes(1)
    const [jobName, data, opts] = addSpy.mock.calls[0]
    expect(jobName).toBe(QUEUE.JOBS.OUTBOX_DISPATCH)
    expect(data).toMatchObject({ publicId: row.publicId })
    expect((data as { emails: unknown[] }).emails).toHaveLength(2) // user + staff
    expect(opts).toMatchObject({ jobId: row.publicId })

    // lock released
    expect(await getRedisCache().exists(PROCESSOR_LOCK)).toBe(0)
  })

  it('skips the run entirely when another instance holds the processor lock', async () => {
    const token = await DistributedLock.acquire(PROCESSOR_LOCK, 10_000)
    expect(token).not.toBeNull()

    const row = await prisma.outboxEvent.create({
      data: { type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED, status: 'PENDING', payload: CONTACT_PAYLOAD },
    })

    await makeProcessor().processPendingEvents()

    expect(addSpy).not.toHaveBeenCalled()
    const after = await prisma.outboxEvent.findUnique({ where: { publicId: row.publicId } })
    expect(after?.status).toBe('PENDING')
    expect(await getRedisCache().get(PROCESSOR_LOCK)).toBe(token) // holder untouched

    await DistributedLock.release(PROCESSOR_LOCK, token as string)
  })

  it('deletes an already-expired event instead of dispatching it', async () => {
    const row = await prisma.outboxEvent.create({
      data: {
        type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
        status: 'PENDING',
        payload: CONTACT_PAYLOAD,
        expiresAt: new Date(Date.now() - 60_000),
      },
    })

    await makeProcessor().processPendingEvents()

    expect(addSpy).not.toHaveBeenCalled()
    expect(await prisma.outboxEvent.findUnique({ where: { publicId: row.publicId } })).toBeNull()
  })

  it('marks a poison event (attempts >= MAX_DISPATCH_ATTEMPTS) as FAILED without dispatching', async () => {
    const row = await prisma.outboxEvent.create({
      data: {
        type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
        status: 'PENDING',
        payload: CONTACT_PAYLOAD,
        attempts: OUTBOX_CONSTANTS.THRESHOLDS.MAX_DISPATCH_ATTEMPTS,
      },
    })

    await makeProcessor().processPendingEvents()

    expect(addSpy).not.toHaveBeenCalled()
    const after = await prisma.outboxEvent.findUnique({ where: { publicId: row.publicId } })
    expect(after?.status).toBe('FAILED')
  })
})
