import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockWorkerConstructor = vi.fn()
const mockWorkerClose = vi.fn()
const mockOn = vi.fn()

vi.mock('bullmq', () => ({
  Worker: class {
    on = mockOn
    close = mockWorkerClose
    constructor(name: string, processor: unknown, opts: unknown) {
      mockWorkerConstructor(name, processor, opts)
    }
  },
}))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockWorkerConnection = { id: 'redis-worker-outbox-dispatch' }
const mockCreateWorkerConnection = vi.fn(() => mockWorkerConnection)
const mockAttachRedisLogger = vi.fn()

vi.mock('@lib/redis/clients/clients', () => ({
  createWorkerConnection: () => mockCreateWorkerConnection(),
}))

vi.mock('@lib/redis/connections/redis-bullMQ-connection', () => ({
  attachRedisLogger: (...args: unknown[]) => mockAttachRedisLogger(...args),
}))

const mockCaptureError = vi.fn()
vi.mock('@lib/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

import { QUEUE } from 'messages/constants/queue/queue'
import { WORKER_CONSTANTS } from 'messages/constants/workers/workers'
import { IOutboxEvent, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { OutboxProcessor } from '@lib/infra/jobs/outbox-processor'
import { createOutboxDispatchJobProcessor, startOutboxDispatchWorker } from './outbox-dispatch-worker'

describe('outbox-dispatch-worker', () => {
  const fakeEvent: IOutboxEvent = {
    id: 1,
    publicId: 'evt-worker-123',
    type: 'FormSubmissionCreated',
    status: IOutboxEventStatus.PENDING,
    payload: {},
    attempts: 0,
    occurredAt: new Date(),
    sendingAt: undefined,
    expiresAt: undefined,
    pendingRecipients: [],
  }

  const mockProcessor = {
    processSingleEvent: vi.fn(),
  } as unknown as OutboxProcessor

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createOutboxDispatchJobProcessor', () => {
    it('processa o evento da mensagem chamando processSingleEvent', async () => {
      const jobHandler = createOutboxDispatchJobProcessor(mockProcessor)
      const fakeJob = {
        id: 'job-1',
        data: { publicId: fakeEvent.publicId, event: fakeEvent },
      }

      await jobHandler(fakeJob as never)

      expect(mockProcessor.processSingleEvent).toHaveBeenCalledWith(fakeEvent)
    })

    it('captura erro no Sentry e propaga a exceção para que o BullMQ realize o retry', async () => {
      const jobHandler = createOutboxDispatchJobProcessor(mockProcessor)
      const testError = new Error('Falha no processador')
      vi.mocked(mockProcessor.processSingleEvent).mockRejectedValueOnce(testError)

      const fakeJob = {
        id: 'job-1',
        data: { publicId: fakeEvent.publicId, event: fakeEvent },
      }

      await expect(jobHandler(fakeJob as never)).rejects.toThrow(testError)
      expect(mockCaptureError).toHaveBeenCalledWith(testError, { jobId: 'job-1', publicId: fakeEvent.publicId })
    })
  })

  describe('startOutboxDispatchWorker', () => {
    it('instancia o worker com o nome da fila e as opções de concorrência configuradas', () => {
      startOutboxDispatchWorker(mockProcessor)

      const [name, , opts] = mockWorkerConstructor.mock.calls[0] as [
        string,
        unknown,
        { connection: unknown; concurrency: number; lockDuration: number; stalledInterval: number },
      ]

      expect(name).toBe(QUEUE.NAMES.OUTBOX_DISPATCH)
      expect(opts.connection).toBe(mockWorkerConnection)
      expect(opts.concurrency).toBe(WORKER_CONSTANTS.OUTBOX_DISPATCH.CONCURRENCY_LIMIT)
      expect(opts.lockDuration).toBe(WORKER_CONSTANTS.OUTBOX_DISPATCH.LOCK_DURATION_MS)
      expect(opts.stalledInterval).toBe(WORKER_CONSTANTS.OUTBOX_DISPATCH.STALLED_INTERVAL_MS)
    })

    it('anexa o logger de conexão do Redis para o worker', () => {
      startOutboxDispatchWorker(mockProcessor)

      expect(mockAttachRedisLogger).toHaveBeenCalledWith(mockWorkerConnection, 'OutboxDispatchWorker')
    })
  })
})
