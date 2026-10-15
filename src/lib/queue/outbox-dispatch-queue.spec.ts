import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockQueueConstructor = vi.fn()
const mockQueueAdd = vi.fn()
const mockQueueClose = vi.fn()
const mockOn = vi.fn()

vi.mock('bullmq', () => ({
  Queue: class {
    on = mockOn
    add = mockQueueAdd
    close = mockQueueClose
    constructor(name: string, opts: unknown) {
      mockQueueConstructor(name, opts)
    }
  },
}))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockRedis = { id: 'redis-fila-outbox-dispatch' }
const mockGetRedisForQueue = vi.fn(() => mockRedis)
const mockAttachRedisLogger = vi.fn()

vi.mock('@lib/redis/clients/clients', () => ({
  getRedisForQueue: () => mockGetRedisForQueue(),
}))

vi.mock('@lib/redis/connections/redis-bullMQ-connection', () => ({
  attachRedisLogger: (...args: unknown[]) => mockAttachRedisLogger(...args),
}))

const mockMetricInc = vi.fn()
const mockMetricFailInc = vi.fn()

vi.mock('@lib/metrics/outbox-metrics', () => ({
  collectMetricsOutboxDispatchEnqueued: { inc: () => mockMetricInc() },
  collectMetricsOutboxDispatchEnqueueFailed: { inc: () => mockMetricFailInc() },
}))

import { QUEUE } from 'messages/constants/queue/queue'
import { IOutboxEvent, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { logger } from '@lib/logger'

async function loadModule() {
  vi.resetModules()
  return import('./outbox-dispatch-queue.js')
}

describe('outbox-dispatch-queue', () => {
  let getOutboxDispatchQueue: (typeof import('./outbox-dispatch-queue.js'))['getOutboxDispatchQueue']
  let enqueueOutboxDispatch: (typeof import('./outbox-dispatch-queue.js'))['enqueueOutboxDispatch']
  let closeOutboxDispatchQueue: (typeof import('./outbox-dispatch-queue.js'))['closeOutboxDispatchQueue']

  const fakeEvent: IOutboxEvent = {
    id: 1,
    publicId: 'evt-cas-123',
    type: 'FormSubmissionCreated',
    status: IOutboxEventStatus.PENDING,
    payload: {},
    attempts: 0,
    occurredAt: new Date(),
    sendingAt: undefined,
    expiresAt: undefined,
    pendingRecipients: [],
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    ;({ getOutboxDispatchQueue, enqueueOutboxDispatch, closeOutboxDispatchQueue } = await loadModule())
  })

  describe('getOutboxDispatchQueue', () => {
    it('cria a fila com nome correto e conexão compartilhada', () => {
      getOutboxDispatchQueue()

      const [name, opts] = mockQueueConstructor.mock.calls[0] as [string, { connection: unknown }]
      expect(name).toBe(QUEUE.NAMES.OUTBOX_DISPATCH)
      expect(opts.connection).toBe(mockRedis)
    })

    it('aplica política de tentativas, backoff exponencial e removeOnComplete/removeOnFail', () => {
      getOutboxDispatchQueue()

      const [, opts] = mockQueueConstructor.mock.calls[0] as [string, { defaultJobOptions: Record<string, unknown> }]
      expect(opts.defaultJobOptions).toEqual({
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: true,
      })
    })

    it('retorna a mesma instância quando chamado múltiplas vezes (singleton)', () => {
      const q1 = getOutboxDispatchQueue()
      const q2 = getOutboxDispatchQueue()

      expect(q1).toBe(q2)
      expect(mockQueueConstructor).toHaveBeenCalledOnce()
    })
  })

  describe('enqueueOutboxDispatch', () => {
    it('enfileira evento com jobId determinístico (publicId) para deduplicação e incrementa métrica', async () => {
      mockQueueAdd.mockResolvedValueOnce({})

      await enqueueOutboxDispatch(fakeEvent)

      expect(mockQueueAdd).toHaveBeenCalledWith(
        QUEUE.JOBS.OUTBOX_DISPATCH,
        { publicId: fakeEvent.publicId, event: fakeEvent },
        { jobId: fakeEvent.publicId },
      )
      expect(mockMetricInc).toHaveBeenCalledOnce()
      expect(mockMetricFailInc).not.toHaveBeenCalled()
    })

    it('trata falha de enfileiramento sem lançar exceção (fire-and-forget), loga aviso e incrementa métrica de falha', async () => {
      mockQueueAdd.mockRejectedValueOnce(new Error('Redis indisponível'))

      await expect(enqueueOutboxDispatch(fakeEvent)).resolves.toBeUndefined()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ publicId: fakeEvent.publicId }),
        expect.any(String),
      )
      expect(mockMetricFailInc).toHaveBeenCalledOnce()
      expect(mockMetricInc).not.toHaveBeenCalled()
    })
  })

  describe('closeOutboxDispatchQueue', () => {
    it('fecha a fila se foi instanciada', async () => {
      getOutboxDispatchQueue()
      mockQueueClose.mockResolvedValueOnce(undefined)

      await closeOutboxDispatchQueue()

      expect(mockQueueClose).toHaveBeenCalledOnce()
    })

    it('não falha se a fila não foi instanciada', async () => {
      await expect(closeOutboxDispatchQueue()).resolves.toBeUndefined()
      expect(mockQueueClose).not.toHaveBeenCalled()
    })
  })
})
