/**
 * A fábrica da fila de manutenção. O que se testa aqui é a CONFIGURAÇÃO — ela
 * é a política de retentativa dos jobs agendados, e um valor errado só
 * apareceria em produção, de madrugada, como um job que não repete ou que
 * repete para sempre.
 */
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

const mockRedis = { id: 'redis-fila' }
const mockGetRedisForQueue = vi.fn(() => mockRedis)
const mockAttachRedisLogger = vi.fn()

vi.mock('@infra/redis/clients/clients', () => ({
  getRedisForQueue: () => mockGetRedisForQueue(),
}))

vi.mock('@infra/redis/connections/redis-bullMQ-connection', () => ({
  attachRedisLogger: (...args: unknown[]) => mockAttachRedisLogger(...args),
}))

import { logger } from '@infra/logger'
import { QUEUE } from '@common/messages/constants/queue/queue'
import { WORKER_CONSTANTS } from '@common/messages/constants/workers/workers'
import { OUTBOX_LOGS } from '@common/messages/constants/logs/outbox'

/**
 * A fila é memoizada no escopo do módulo. Sem recarregar o módulo a cada teste,
 * a primeira instância vazaria para os seguintes e as asserções sobre a
 * CONSTRUÇÃO passariam a medir o teste anterior, não o atual.
 */
async function loadModule() {
  vi.resetModules()
  return import('./maintenance-queue.js')
}

describe('getMaintenanceQueue', () => {
  let getMaintenanceQueue: (typeof import('./maintenance-queue.js'))['getMaintenanceQueue']

  beforeEach(async () => {
    vi.clearAllMocks()
    ;({ getMaintenanceQueue } = await loadModule())
  })

  it('cria a fila com o nome e a conexão compartilhada do BullMQ', () => {
    getMaintenanceQueue()

    const [name, opts] = mockQueueConstructor.mock.calls[0] as [string, { connection: unknown }]

    expect(name).toBe(QUEUE.NAMES.MAINTENANCE)
    expect(opts.connection).toBe(mockRedis)
  })

  it('aplica a política de retentativa dos jobs agendados', () => {
    getMaintenanceQueue()

    const [, opts] = mockQueueConstructor.mock.calls[0] as [string, { defaultJobOptions: Record<string, unknown> }]

    expect(opts.defaultJobOptions).toEqual({
      attempts: WORKER_CONSTANTS.QUEUE.JOB_ATTEMPTS,
      backoff: {
        type: WORKER_CONSTANTS.QUEUE.BACKOFF_TYPE,
        delay: WORKER_CONSTANTS.QUEUE.BACKOFF_DELAY_MS,
      },
      removeOnComplete: true,
      removeOnFail: true,
    })
  })

  /**
   * As varreduras rodam até a cada cinco minutos, para sempre. Guardar jobs
   * concluídos ou falhos encheria o Redis com histórico que ninguém lê — o
   * histórico que importa está nas métricas e nos alertas.
   */
  it('não retém jobs concluídos nem falhos no Redis', () => {
    getMaintenanceQueue()

    const [, opts] = mockQueueConstructor.mock.calls[0] as [string, { defaultJobOptions: Record<string, unknown> }]

    expect(opts.defaultJobOptions.removeOnComplete).toBe(true)
    expect(opts.defaultJobOptions.removeOnFail).toBe(true)
  })

  it('anexa o logger de Redis identificando a fila', () => {
    getMaintenanceQueue()

    expect(mockAttachRedisLogger).toHaveBeenCalledWith(mockRedis, QUEUE.NAMES.MAINTENANCE)
  })

  it('registra um handler de erro que loga a falha da fila', () => {
    getMaintenanceQueue()

    const [event, handler] = mockOn.mock.calls[0] as [string, (err: unknown) => void]
    const err = new Error('fila caiu')

    expect(event).toBe('error')

    handler(err)

    expect(logger.error).toHaveBeenCalledWith({ err }, OUTBOX_LOGS.MAINTENANCE_QUEUE_ERROR)
  })

  /**
   * Memoização: uma segunda fila sobre a mesma conexão duplicaria listeners e
   * contadores de métrica. O agendador e o `worker.ts` chamam esta função em
   * pontos diferentes do boot, então a garantia precisa valer entre chamadas.
   */
  it('devolve sempre a mesma instância, sem reconstruir a fila', () => {
    const first = getMaintenanceQueue()
    const second = getMaintenanceQueue()

    expect(second).toBe(first)
    expect(mockQueueConstructor).toHaveBeenCalledOnce()
    expect(mockGetRedisForQueue).toHaveBeenCalledOnce()
  })
})
