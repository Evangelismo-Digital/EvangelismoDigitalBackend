import { vi, describe, it, expect, beforeEach } from 'vitest'

// 1. Habilita métricas: o registry lê env de '@env/index'. Mantemos os demais
//    campos que o OutboxProcessor / dispatch strategies consomem transitivamente.
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

const mockAcquire = vi.fn()
const mockRenew = vi.fn()
const mockRelease = vi.fn()

vi.mock('@lib/infra/distributed-lock/distributed-lock', () => ({
  DistributedLock: {
    acquire: (...args: unknown[]) => mockAcquire(...args),
    renew: (...args: unknown[]) => mockRenew(...args),
    release: (...args: unknown[]) => mockRelease(...args),
  },
}))

const mockQueueAdd = vi.fn()

vi.mock('@lib/queue/mail-queue', () => ({
  getMailQueue: () => ({ add: mockQueueAdd }),
}))

vi.mock('@lib/sentry/capture', () => ({
  captureError: vi.fn(),
}))

// Evita instanciar o PrismaClient real ao importar os módulos de job (que puxam
// o PrismaOutboxRepository); os testes sempre injetam stubs.
vi.mock('@lib/prisma', () => ({ prisma: {} }))

// ioredis mockado para OutboxSignal.publishNewItem — status 'ready' evita o connect().
const mockPublish = vi.fn()
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(function () {
    return {
      status: 'ready',
      publish: mockPublish,
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
    }
  })
  return { default: RedisMock, Redis: RedisMock }
})

// Imports reais após os mocks
import type { Metric } from 'prom-client'
import type { Job } from 'bullmq'
import { OutboxProcessor } from './outbox-processor'
import { OutboxMaintenance } from './outbox-maintenance'
import { AnalyticsRetention } from './analytics-retention'
import { createMaintenanceJobProcessor } from './maintenance-worker'
import { QUEUE } from 'messages/constants/queue/queue'
import type { IMaintenanceJobData } from 'core/contracts/lib/infra/maintenance-job-data.interface'
import { OutboxSignal } from '@lib/infra/events/outbox-signal'
import { makeOutboxDispatchStrategyRegistry } from './make-outbox-dispatch-registry'
import { InMemoryOutboxRepository } from '@repositories/in-memory/in-memory-outbox-repository'
import { IOutboxEvent, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { isOk, ok, err } from 'core/shared/result'
import { InfrastructureError } from 'errors'
import { OUTBOX_CONSTANTS } from 'messages/constants/outbox/outbox'
import { getRegistry } from '@lib/metrics'
import {
  collectMetricsOutboxEventsDispatched,
  collectMetricsOutboxEventsClaimed,
  collectMetricsOutboxEventsReverted,
  collectMetricsOutboxEventsRevertFailed,
  collectMetricsOutboxEventsMarkedAsTerminalFail,
  collectMetricsOutboxEventsExpired,
  collectMetricsOutboxEventsStuckSendingEventsRecovered,
  collectMetricsOutboxCronRuns,
  collectMetricsOutboxMaintenanceDeleted,
  collectMetricsOutboxSignalPublished,
  collectMetricsOutboxSignalPublishFailed,
} from '@lib/metrics/outbox-metrics'

class TestRevertError extends InfrastructureError {
  constructor() {
    super({ code: 'TEST_REVERT_ERROR', message: 'falha injetada no revert' })
  }
}

async function metricValue(metric: Metric | null, labels: Record<string, string> = {}): Promise<number> {
  if (!metric) return 0
  const data = await (
    metric as unknown as {
      get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string> }> }>
    }
  ).get()
  const match = data.values.find((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))
  return match?.value ?? 0
}

async function createEvent(
  repository: InMemoryOutboxRepository,
  overrides?: { attempts?: number },
): Promise<IOutboxEvent> {
  const created = await repository.create({
    status: IOutboxEventStatus.PENDING,
    type: 'FormSubmissionCreated',
    payload: {
      name: 'João',
      lastName: 'Silva',
      email: 'joao@test.com',
      decisaoPorCristo: false,
    },
  })
  if (!isOk(created)) throw new Error('setup: falha ao criar evento')

  const item = repository.items.find((e) => e.publicId === created.value.publicId)!
  if (overrides?.attempts !== undefined) {
    item.attempts = overrides.attempts
  }
  return item
}

describe('Outbox metrics instrumentation', () => {
  let repository: InMemoryOutboxRepository
  let processor: OutboxProcessor

  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry()?.resetMetrics()

    repository = new InMemoryOutboxRepository()
    processor = new OutboxProcessor(repository, makeOutboxDispatchStrategyRegistry())

    mockAcquire.mockResolvedValue('lock-token')
    mockRenew.mockResolvedValue(true)
    mockRelease.mockResolvedValue(true)
    mockQueueAdd.mockResolvedValue({})
  })

  describe('processSingleEvent', () => {
    it('counts a dispatch when the BullMQ enqueue succeeds', async () => {
      const event = await createEvent(repository)

      await processor.processSingleEvent(event)

      expect(await metricValue(collectMetricsOutboxEventsDispatched)).toBe(1)
      expect(await metricValue(collectMetricsOutboxEventsReverted)).toBe(0)
    })

    it('counts a claimed CAS outcome when event claim succeeds', async () => {
      const event = await createEvent(repository)

      await processor.processSingleEvent(event)

      expect(await metricValue(collectMetricsOutboxEventsClaimed, { outcome: 'claimed' })).toBe(1)
      expect(await metricValue(collectMetricsOutboxEventsClaimed, { outcome: 'contention' })).toBe(0)
    })

    it('counts a contention CAS outcome when event is already claimed', async () => {
      const event = await createEvent(repository)
      vi.spyOn(repository, 'claim').mockResolvedValueOnce(ok(false))

      await processor.processSingleEvent(event)

      expect(await metricValue(collectMetricsOutboxEventsClaimed, { outcome: 'contention' })).toBe(1)
      expect(await metricValue(collectMetricsOutboxEventsClaimed, { outcome: 'claimed' })).toBe(0)
    })

    it('counts a revert when dispatch fails and the PENDING write succeeds', async () => {
      const event = await createEvent(repository)
      mockQueueAdd.mockRejectedValueOnce(new Error('redis indisponível'))

      await processor.processSingleEvent(event)

      expect(await metricValue(collectMetricsOutboxEventsReverted)).toBe(1)
      expect(await metricValue(collectMetricsOutboxEventsRevertFailed)).toBe(0)
      expect(await metricValue(collectMetricsOutboxEventsDispatched)).toBe(0)
    })

    it('counts a revert-failed when dispatch fails and the PENDING write also fails', async () => {
      const event = await createEvent(repository)
      mockQueueAdd.mockRejectedValueOnce(new Error('redis indisponível'))

      // A transição para SENDING (Fase 1) deve suceder; apenas o revert -> PENDING falha.
      const realUpdateStatus = repository.updateStatus.bind(repository)
      vi.spyOn(repository, 'updateStatus').mockImplementation(async (publicId, status) => {
        if (status === IOutboxEventStatus.PENDING) return err(new TestRevertError())
        return realUpdateStatus(publicId, status)
      })

      await processor.processSingleEvent(event)

      expect(await metricValue(collectMetricsOutboxEventsRevertFailed)).toBe(1)
      expect(await metricValue(collectMetricsOutboxEventsReverted)).toBe(0)
    })

    it('counts a terminal-fail when the event exceeds the dispatch attempts cap', async () => {
      const event = await createEvent(repository, { attempts: OUTBOX_CONSTANTS.THRESHOLDS.MAX_DISPATCH_ATTEMPTS })

      await processor.processSingleEvent(event)

      expect(await metricValue(collectMetricsOutboxEventsMarkedAsTerminalFail)).toBe(1)
      expect(await metricValue(collectMetricsOutboxEventsDispatched)).toBe(0)
    })

    it('counts an expired event when the expiration gate deletes it', async () => {
      const event = await createEvent(repository)
      event.expiresAt = new Date(Date.now() - 1000)

      await processor.processSingleEvent(event)

      expect(await metricValue(collectMetricsOutboxEventsExpired)).toBe(1)
      expect(await metricValue(collectMetricsOutboxEventsDispatched)).toBe(0)
    })
  })

  describe('processStuckSendingEvents', () => {
    it('counts one recovery per stuck SENDING event the loop reprocesses', async () => {
      const oldSendingAt = new Date(Date.now() - OUTBOX_CONSTANTS.THRESHOLDS.STUCK_SENDING_MS - 60_000)
      for (let i = 0; i < 3; i++) {
        const event = await createEvent(repository)
        event.status = IOutboxEventStatus.SENDING
        event.sendingAt = oldSendingAt
      }

      await processor.processStuckSendingEvents()

      expect(await metricValue(collectMetricsOutboxEventsStuckSendingEventsRecovered)).toBe(3)
    })
  })

  describe('OutboxSignal.publishNewItem', () => {
    const event = { publicId: 'evt-1' } as unknown as IOutboxEvent

    it('counts a published signal when the publish succeeds', async () => {
      mockPublish.mockResolvedValueOnce(1)

      await OutboxSignal.publishNewItem('evt-1', event)

      expect(await metricValue(collectMetricsOutboxSignalPublished)).toBe(1)
      expect(await metricValue(collectMetricsOutboxSignalPublishFailed)).toBe(0)
    })

    it('counts a publish failure when the publish throws', async () => {
      mockPublish.mockRejectedValueOnce(new Error('redis down'))

      await OutboxSignal.publishNewItem('evt-1', event)

      expect(await metricValue(collectMetricsOutboxSignalPublishFailed)).toBe(1)
      expect(await metricValue(collectMetricsOutboxSignalPublished)).toBe(0)
    })
  })

  describe('OutboxMaintenance', () => {
    it('counts expiry-sweep deletions by the number of events removed', async () => {
      const maintenance = new OutboxMaintenance(repository)
      const past = new Date(Date.now() - 1000)
      for (let i = 0; i < 2; i++) {
        const event = await createEvent(repository)
        event.expiresAt = past
      }

      await maintenance.sweepExpiredEvents()

      expect(await metricValue(collectMetricsOutboxMaintenanceDeleted, { operation: 'expiry_sweep' })).toBe(2)
    })

    it('counts retention-purge deletions by the number of events removed', async () => {
      const maintenance = new OutboxMaintenance(repository)
      const old = new Date(Date.now() - (OUTBOX_CONSTANTS.RETENTION.DAYS + 1) * 24 * 60 * 60 * 1000)
      for (let i = 0; i < 4; i++) {
        const event = await createEvent(repository)
        event.occurredAt = old
      }

      await maintenance.purgeOldEvents()

      expect(await metricValue(collectMetricsOutboxMaintenanceDeleted, { operation: 'retention_purge' })).toBe(4)
    })

    it('counts failed-purge deletions by the number of events removed', async () => {
      const maintenance = new OutboxMaintenance(repository)
      const old = new Date(Date.now() - (OUTBOX_CONSTANTS.RETENTION.FAILED_DAYS + 1) * 24 * 60 * 60 * 1000)
      for (let i = 0; i < 3; i++) {
        const event = await createEvent(repository)
        event.status = IOutboxEventStatus.FAILED
        event.occurredAt = old
      }

      await maintenance.purgeFailedEvents()

      expect(await metricValue(collectMetricsOutboxMaintenanceDeleted, { operation: 'failed_purge' })).toBe(3)
    })
  })

  /**
   * Os rótulos de `phase` são contrato com os painéis do Grafana: eles
   * sobreviveram à migração do node-cron para os Job Schedulers do BullMQ. A
   * asserção é por rótulo, não só no contador, porque é o rótulo que quebra o
   * painel quando alguém o renomeia.
   */
  describe('maintenance job processor', () => {
    it('counts each maintenance phase when its job runs, preserving the Grafana phase labels', async () => {
      const stubProcessor = {
        processStuckSendingEvents: vi.fn().mockResolvedValue(undefined),
        processPendingEvents: vi.fn().mockResolvedValue(undefined),
      } as unknown as OutboxProcessor
      const stubMaintenance = {
        sweepExpiredEvents: vi.fn().mockResolvedValue(undefined),
        purgeOldEvents: vi.fn().mockResolvedValue(undefined),
        purgeFailedEvents: vi.fn().mockResolvedValue(undefined),
      } as unknown as OutboxMaintenance
      const stubAnalyticsRetention = {
        purgeExpiredData: vi.fn().mockResolvedValue(undefined),
      } as unknown as AnalyticsRetention

      const process = createMaintenanceJobProcessor({
        processor: stubProcessor,
        maintenance: stubMaintenance,
        analyticsRetention: stubAnalyticsRetention,
      })

      const job = (name: string) =>
        ({
          id: `job-${name}`,
          name,
          data: {},
          attemptsMade: 0,
          opts: { attempts: 3 },
        }) as unknown as Job<IMaintenanceJobData>

      await process(job(QUEUE.JOBS.FIVE_MIN_SWEEP))
      await process(job(QUEUE.JOBS.MIDNIGHT_SCAN))
      await process(job(QUEUE.JOBS.RETENTION_PURGE))
      await process(job(QUEUE.JOBS.ANALYTICS_RETENTION))
      await process(job(QUEUE.JOBS.FAILED_JOBS_CLEANUP))

      expect(await metricValue(collectMetricsOutboxCronRuns, { phase: 'five_min_sweep' })).toBe(1)
      expect(await metricValue(collectMetricsOutboxCronRuns, { phase: 'five_min_pending' })).toBe(1)
      expect(await metricValue(collectMetricsOutboxCronRuns, { phase: 'midnight_recovery' })).toBe(1)
      expect(await metricValue(collectMetricsOutboxCronRuns, { phase: 'midnight_pending' })).toBe(1)
      expect(await metricValue(collectMetricsOutboxCronRuns, { phase: 'retention_purge' })).toBe(1)
      expect(await metricValue(collectMetricsOutboxCronRuns, { phase: 'analytics_retention' })).toBe(1)
      expect(await metricValue(collectMetricsOutboxCronRuns, { phase: 'failed_jobs_cleanup' })).toBe(1)
    })
  })
})
