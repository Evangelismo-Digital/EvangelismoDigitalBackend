/**
 * Integration — createMailJobProcessor against a real Docker Postgres (outbox
 * row) + real Redis (idempotency key). SMTP is stubbed at the sender boundary.
 *
 * Opt-in: `npm run test:integration:full` with the compose stack up. Not in CI.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'bullmq'

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))
vi.mock('@lib/mail/nodemailer-mail-sender', () => ({
  NodemailerMailSender: class {
    send = mockSend
  },
}))

import { createMailJobProcessor } from './mail-worker'
import { PrismaOutboxRepository } from '@repositories/prisma/prisma-outbox-event-repository'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@repositories/prisma/errors/outbox-error-mapping'
import { getRedisCache, closeAllRedisConnections } from '@lib/redis/clients/clients'
import { prisma } from '@lib/prisma'
import { IOutboxDispatchData } from 'core/contracts/lib/infra/outbox-dispatch-data.interface'
import { IMailJobData } from 'core/contracts/lib/queue/mail-job-data.interface'
import { OUTBOX_EVENT_TYPES } from 'core/types/outbox/outbox-event-input'
import { REDIS_CONSTANTS } from 'messages/constants/redis/redis'

const repo = new PrismaOutboxRepository(
  new DatabaseContext(),
  new PrismaErrorMapper(outboxHttpPrismaErrorMapping),
  new PrismaErrorMapper(outboxInfraPrismaErrorMapping),
)
const processJob = createMailJobProcessor(repo)

const USER_EMAIL: IMailJobData = { to: 'user@example.com', subject: 'S', message: 'M', html: '<p>M</p>' }
const STAFF_EMAIL: IMailJobData = { to: 'staff@example.com', subject: 'S2', message: 'M2', html: '<p>M2</p>' }

function fakeJob(data: IOutboxDispatchData): Job<IOutboxDispatchData> {
  return {
    id: `job-${data.publicId}`,
    data,
    updateData: vi.fn(async function (this: { data: IOutboxDispatchData }, next: IOutboxDispatchData) {
      this.data = next
    }),
  } as unknown as Job<IOutboxDispatchData>
}

async function seedOutboxRow(): Promise<string> {
  const row = await prisma.outboxEvent.create({
    data: { type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED, status: 'SENDING', payload: {} },
  })
  return row.publicId
}

async function cleanup(publicId: string) {
  await prisma.outboxEvent.deleteMany({ where: { publicId } })
  await getRedisCache().del(`${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`)
}

let publicId: string

beforeAll(async () => {
  // touch the cache client so it's connected before the first job
  const c = getRedisCache()
  if (c.status !== 'ready') await new Promise<void>((r) => c.once('ready', () => r()))
})

beforeEach(async () => {
  vi.clearAllMocks()
  publicId = await seedOutboxRow()
})

afterEach(async () => {
  await cleanup(publicId)
})

afterAll(async () => {
  await closeAllRedisConnections()
  await prisma.$disconnect()
})

describe('createMailJobProcessor (integration, real Postgres + Redis)', () => {
  it('sends every email, marks idempotency completed and deletes the outbox row', async () => {
    mockSend.mockResolvedValue({ messageId: 'ok' })

    await processJob(fakeJob({ publicId, emails: [USER_EMAIL, STAFF_EMAIL] }))

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(await getRedisCache().get(`${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`)).toBe('completed')
    expect(await prisma.outboxEvent.findUnique({ where: { publicId } })).toBeNull()
  })

  it('is idempotent: a re-delivery after completion re-deletes the row and does not re-send', async () => {
    mockSend.mockResolvedValue({ messageId: 'ok' })
    await processJob(fakeJob({ publicId, emails: [USER_EMAIL, STAFF_EMAIL] }))
    mockSend.mockClear()

    await processJob(fakeJob({ publicId, emails: [USER_EMAIL, STAFF_EMAIL] }))

    expect(mockSend).not.toHaveBeenCalled()
    expect(await getRedisCache().get(`${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`)).toBe('completed')
  })

  it('expiry gate: a job past expiresAt deletes the row and never touches SMTP or the idempotency key', async () => {
    mockSend.mockResolvedValue({ messageId: 'ok' })

    await processJob(
      fakeJob({
        publicId,
        emails: [USER_EMAIL, STAFF_EMAIL],
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    )

    expect(mockSend).not.toHaveBeenCalled()
    expect(await getRedisCache().get(`${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`)).toBeNull()
    expect(await prisma.outboxEvent.findUnique({ where: { publicId } })).toBeNull()
  })

  it('partial failure: persists the failed recipient for selective retry, frees the idempotency key and rethrows', async () => {
    mockSend.mockImplementation(async (req: IMailJobData) => {
      if (req.to === STAFF_EMAIL.to) throw new Error('SMTP 550 for staff')
      return { messageId: 'ok' }
    })

    const job = fakeJob({ publicId, emails: [USER_EMAIL, STAFF_EMAIL] })

    await expect(processJob(job)).rejects.toThrow()

    const row = await prisma.outboxEvent.findUnique({ where: { publicId } })
    expect(row).not.toBeNull()
    expect(row?.pendingRecipients).toEqual([STAFF_EMAIL.to])

    expect(job.updateData).toHaveBeenCalledWith(
      expect.objectContaining({ publicId, emails: [expect.objectContaining({ to: STAFF_EMAIL.to })] }),
    )
    // key freed so BullMQ's retry can re-run the (now selective) batch
    expect(await getRedisCache().get(`${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`)).toBeNull()
  })

  it('concurrent delivery: a second worker seeing the "processing" key throws JobAlreadyProcessing and does not send', async () => {
    // Pre-claim the idempotency key as another worker would.
    await getRedisCache().set(
      `${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`,
      'processing',
      'EX',
      300,
      'NX',
    )
    mockSend.mockResolvedValue({ messageId: 'ok' })

    await expect(processJob(fakeJob({ publicId, emails: [USER_EMAIL] }))).rejects.toThrow()
    expect(mockSend).not.toHaveBeenCalled()
  })
})
