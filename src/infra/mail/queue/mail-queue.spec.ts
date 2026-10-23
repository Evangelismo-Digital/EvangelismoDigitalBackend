import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockQueueConstructor = vi.fn()
const mockOn = vi.fn()

vi.mock('bullmq', () => ({
  Queue: class {
    on = mockOn
    constructor(name: string, opts: unknown) {
      mockQueueConstructor(name, opts)
    }
  },
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockRedis = { id: 'redis-mail-queue' }
const mockGetRedisForQueue = vi.fn(() => mockRedis)
const mockAttachRedisLogger = vi.fn()

vi.mock('@infra/redis/clients/clients', () => ({
  getRedisForQueue: () => mockGetRedisForQueue(),
}))

vi.mock('@infra/redis/connections/redis-bullMQ-connection', () => ({
  attachRedisLogger: (...args: unknown[]) => mockAttachRedisLogger(...args),
}))

import { QUEUE } from '@common/messages/constants/queue/queue'
import { WORKER_CONSTANTS } from '@common/messages/constants/workers/workers'

async function loadModule() {
  vi.resetModules()
  return import('./mail-queue.js')
}

describe('getMailQueue', () => {
  let getMailQueue: (typeof import('./mail-queue.js'))['getMailQueue']

  beforeEach(async () => {
    vi.clearAllMocks()
    ;({ getMailQueue } = await loadModule())
  })

  it('cria a fila com o nome e a conexão compartilhada do BullMQ', () => {
    getMailQueue()

    const [name, opts] = mockQueueConstructor.mock.calls[0] as [string, { connection: unknown }]

    expect(name).toBe(QUEUE.NAMES.MAIL)
    expect(opts.connection).toBe(mockRedis)
  })

  it('aplica política de tentativas, backoff exponencial com jitter e retenção forense', () => {
    getMailQueue()

    const [, opts] = mockQueueConstructor.mock.calls[0] as [string, { defaultJobOptions: Record<string, unknown> }]

    expect(opts.defaultJobOptions).toEqual({
      attempts: WORKER_CONSTANTS.QUEUE.JOB_ATTEMPTS,
      backoff: {
        type: WORKER_CONSTANTS.QUEUE.BACKOFF_TYPE,
        delay: WORKER_CONSTANTS.QUEUE.BACKOFF_DELAY_MS,
        jitter: WORKER_CONSTANTS.QUEUE.BACKOFF_JITTER,
      },
      removeOnComplete: WORKER_CONSTANTS.MAIL.REMOVE_ON_COMPLETE,
      removeOnFail: WORKER_CONSTANTS.MAIL.REMOVE_ON_FAIL,
    })
  })

  it('retorna a mesma instância quando chamado múltiplas vezes (singleton)', () => {
    const q1 = getMailQueue()
    const q2 = getMailQueue()

    expect(q1).toBe(q2)
    expect(mockQueueConstructor).toHaveBeenCalledOnce()
  })

  it('anexa o logger de Redis identificando a fila', () => {
    getMailQueue()

    expect(mockAttachRedisLogger).toHaveBeenCalledWith(mockRedis, QUEUE.NAMES.MAIL)
  })
})
