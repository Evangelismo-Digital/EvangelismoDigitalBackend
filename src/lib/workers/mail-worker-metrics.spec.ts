import { vi, describe, it, expect, beforeEach } from 'vitest'

// Habilita métricas: o registry lê env de '@env/index'. Mantemos os demais campos
// que a cadeia de import do mail-worker consome transitivamente.
vi.mock('@env/index', () => ({
  env: {
    METRICS_ENABLED: true,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'http://localhost',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    APP_NAME: 'Test',
    APP_PORT: 3000,
    JWT_SECRET: 'x'.repeat(60),
    FRONTEND_URL: 'http://localhost:5173',
    HASH_SALT_ROUNDS: 12,
    SMTP_EMAIL: 'test@example.com',
    SMTP_PASSWORD: 'test',
    SMTP_PORT: 465,
    SMTP_HOST: 'smtp.test.com',
    SMTP_SECURE: true,
    ADMIN_EMAIL: 'admin@example.com',
    SENTRY_DSN: '',
  },
}))

vi.mock('@lib/logger', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }
  logger.child.mockReturnValue(logger)
  return { logger }
})

const mockRedisSet = vi.fn()
const mockRedisGet = vi.fn()
const mockRedisDel = vi.fn()

vi.mock('@lib/redis/clients/clients', () => ({
  getRedisCache: () => ({ set: mockRedisSet, get: mockRedisGet, del: mockRedisDel }),
  createWorkerConnection: () => ({}),
}))

vi.mock('@lib/redis/connections/redis-bullMQ-connection', () => ({
  attachRedisLogger: vi.fn(),
}))

const mockSendEmailExecute = vi.fn()

vi.mock('@use-cases/factories/make-send-email-use-case', () => ({
  makeSendEmailUseCase: () => ({ execute: mockSendEmailExecute }),
}))

vi.mock('@lib/sentry/capture', () => ({
  captureError: vi.fn(),
}))

import type { Job } from 'bullmq'
import type { Metric } from 'prom-client'
import { createMailJobProcessor } from './mail-worker'
import { IOutboxRepository } from 'core/contracts/repository/outbox-repository.interface'
import { IOutboxDispatchData } from 'core/contracts/lib/infra/outbox-dispatch-data.interface'
import { ok, err } from 'core/shared/result'
import { InfrastructureError } from 'errors/infrastructure-error'
import { JobAlreadyProcessingError } from '@lib/errors/queue/job-already-processing-error'
import { getRegistry } from '@lib/metrics'
import {
  collectMetricsEmailsSent,
  collectMetricsEmailsFailed,
  collectMetricsEmailsSkipped,
  collectMetricsEmailBatchDuration,
} from '@lib/metrics/email-metrics'

class InfraTestError extends InfrastructureError {
  constructor() {
    super({ code: 'INFRA_TEST_ERROR', message: 'falha de infra injetada' })
  }
}

const PUBLIC_ID = 'evt-123'
const emailUser = { to: 'user@test.com', subject: 'a', message: 'a', html: '<p>a</p>' }
const emailStaff = { to: 'staff@test.com', subject: 'b', message: 'b', html: '<p>b</p>' }

async function metricValue(metric: Metric | null, labels: Record<string, string>, suffix?: string): Promise<number> {
  if (!metric) return 0
  const data = await (
    metric as unknown as {
      get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string>; metricName?: string }> }>
    }
  ).get()
  const match = data.values.find(
    (v) =>
      (suffix ? v.metricName?.endsWith(suffix) : true) &&
      Object.entries(labels).every(([k, val]) => v.labels[k] === val),
  )
  return match?.value ?? 0
}

function makeJob(overrides?: Partial<{ emails: unknown[]; expiresAt: string }>) {
  return {
    id: 'job-1',
    data: {
      publicId: PUBLIC_ID,
      emails: overrides?.emails ?? [emailUser, emailStaff],
      ...(overrides?.expiresAt ? { expiresAt: overrides.expiresAt } : {}),
    },
    attemptsMade: 1,
    opts: { attempts: 3 },
    updateData: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<IOutboxDispatchData>
}

function makeRepository() {
  return {
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    updateStatus: vi.fn().mockResolvedValue(ok(undefined)),
    updatePendingRecipients: vi.fn().mockResolvedValue(ok(undefined)),
  }
}

describe('mail-worker email metrics', () => {
  let repository: ReturnType<typeof makeRepository>
  let processor: (job: Job<IOutboxDispatchData>) => Promise<void>

  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry()?.resetMetrics()
    repository = makeRepository()
    processor = createMailJobProcessor(repository as unknown as IOutboxRepository)

    mockRedisSet.mockResolvedValue('OK')
    mockRedisGet.mockResolvedValue(null)
    mockRedisDel.mockResolvedValue(1)
    mockSendEmailExecute.mockResolvedValue(ok({}))
  })

  it('full success counts every recipient as sent and records one batch duration sample', async () => {
    await processor(makeJob())

    expect(await metricValue(collectMetricsEmailsSent, {})).toBe(2)
    expect(await metricValue(collectMetricsEmailsFailed, { error_type: 'smtp' })).toBe(0)
    expect(await metricValue(collectMetricsEmailsSkipped, {})).toBe(0)
    expect(await metricValue(collectMetricsEmailBatchDuration, {}, '_count')).toBe(1)
  })

  it('partial failure counts the sent sub-set and each failed recipient (smtp)', async () => {
    mockSendEmailExecute.mockResolvedValueOnce(ok({})).mockResolvedValueOnce(err(new Error('smtp fail')))

    await expect(processor(makeJob())).rejects.toBeDefined()

    expect(await metricValue(collectMetricsEmailsSent, {})).toBe(1)
    expect(await metricValue(collectMetricsEmailsFailed, { error_type: 'smtp' })).toBe(1)
    expect(repository.updatePendingRecipients).toHaveBeenCalledWith(PUBLIC_ID, ['staff@test.com'])
  })

  it('full-batch SMTP failure counts each recipient as failed and records duration', async () => {
    mockSendEmailExecute.mockResolvedValue(err(new Error('smtp fail')))

    await expect(processor(makeJob())).rejects.toBeDefined()

    expect(await metricValue(collectMetricsEmailsFailed, { error_type: 'smtp' })).toBe(2)
    expect(await metricValue(collectMetricsEmailsSent, {})).toBe(0)
    expect(await metricValue(collectMetricsEmailBatchDuration, {}, '_count')).toBe(1)
    expect(repository.updatePendingRecipients).not.toHaveBeenCalled()
  })

  it('classifies each failure individually in a mixed batch (smtp + infra)', async () => {
    mockSendEmailExecute
      .mockResolvedValueOnce(err(new Error('smtp fail')))
      .mockResolvedValueOnce(err(new InfraTestError()))

    await expect(processor(makeJob())).rejects.toBeDefined()

    expect(await metricValue(collectMetricsEmailsFailed, { error_type: 'smtp' })).toBe(1)
    expect(await metricValue(collectMetricsEmailsFailed, { error_type: 'infra' })).toBe(1)
  })

  it('expired job counts a skip only after the delete succeeds', async () => {
    await processor(makeJob({ expiresAt: new Date(Date.now() - 1000).toISOString() }))

    expect(await metricValue(collectMetricsEmailsSkipped, { reason: 'expired' })).toBe(1)
    expect(mockSendEmailExecute).not.toHaveBeenCalled()
  })

  it('expired job does NOT count a skip when the delete fails', async () => {
    repository.delete.mockResolvedValueOnce(err(new InfraTestError()))

    await expect(processor(makeJob({ expiresAt: new Date(Date.now() - 1000).toISOString() }))).rejects.toBeDefined()

    expect(await metricValue(collectMetricsEmailsSkipped, { reason: 'expired' })).toBe(0)
  })

  it('already-sent dedup counts a skip after the delete succeeds', async () => {
    mockRedisSet.mockResolvedValueOnce(null)
    mockRedisGet.mockResolvedValueOnce('completed')

    await processor(makeJob())

    expect(await metricValue(collectMetricsEmailsSkipped, { reason: 'already_sent' })).toBe(1)
    expect(mockSendEmailExecute).not.toHaveBeenCalled()
  })

  it('concurrent processing contention counts a skip and throws JobAlreadyProcessingError', async () => {
    mockRedisSet.mockResolvedValueOnce(null)
    mockRedisGet.mockResolvedValueOnce('processing')

    await expect(processor(makeJob())).rejects.toBeInstanceOf(JobAlreadyProcessingError)

    expect(await metricValue(collectMetricsEmailsSkipped, { reason: 'processing' })).toBe(1)
  })
})
