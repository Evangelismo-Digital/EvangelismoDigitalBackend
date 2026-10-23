import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockCaptureError = vi.fn()

vi.mock('@infra/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

const mockRunsInc = vi.fn()
const mockFailuresInc = vi.fn()

vi.mock('@infra/metrics/outbox-metrics', () => ({
  collectMetricsOutboxCronRuns: { inc: (...args: unknown[]) => mockRunsInc(...args) },
  collectMetricsOutboxCronFailures: { inc: (...args: unknown[]) => mockFailuresInc(...args) },
}))

const mockWorkerConstructor = vi.fn()
const mockAttachRedisLogger = vi.fn()

vi.mock('@infra/redis/clients/clients', () => ({
  createWorkerConnection: vi.fn().mockReturnValue({}),
}))

vi.mock('@infra/redis/connections/redis-bullMQ-connection', () => ({
  attachRedisLogger: (...args: unknown[]) => mockAttachRedisLogger(...args),
}))

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>()
  return {
    ...actual,
    Worker: class {
      constructor(name: string, processor: unknown, opts: unknown) {
        mockWorkerConstructor(name, processor, opts)
      }
    },
  }
})

import { createMaintenanceJobProcessor, startMaintenanceWorker, MaintenanceDeps } from './maintenance-worker'
import { logger } from '@infra/logger'
import { OUTBOX_LOGS } from '@common/messages/constants/logs/outbox'
import { ANALYTICS_LOGS } from '@common/messages/constants/analytics/analytics'
import { QUEUE } from '@common/messages/constants/queue/queue'
import { WORKER_CONSTANTS } from '@common/messages/constants/workers/workers'
import type { Job } from 'bullmq'
import type { IMaintenanceJobData } from '@infra/outbox/interfaces/maintenance-job-data.interface'

const ATTEMPTS = 3

function makeDeps() {
  return {
    processor: {
      processStuckSendingEvents: vi.fn().mockResolvedValue(undefined),
      processPendingEvents: vi.fn().mockResolvedValue(undefined),
    },
    maintenance: {
      sweepExpiredEvents: vi.fn().mockResolvedValue(undefined),
      purgeOldEvents: vi.fn().mockResolvedValue(undefined),
      purgeFailedEvents: vi.fn().mockResolvedValue(undefined),
    },
    analyticsRetention: {
      purgeExpiredData: vi.fn().mockResolvedValue(undefined),
    },
  }
}

/** `attemptsMade` conta as tentativas ANTERIORES: 0 é a primeira execução. */
function makeJob(name: string, attemptsMade = 0, attempts = ATTEMPTS): Job<IMaintenanceJobData> {
  return {
    id: 'job-1',
    name,
    data: { schedulerId: `maintenance:${name}` },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<IMaintenanceJobData>
}

function lastAttempt(name: string): Job<IMaintenanceJobData> {
  return makeJob(name, ATTEMPTS - 1)
}

describe('createMaintenanceJobProcessor', () => {
  let deps: ReturnType<typeof makeDeps>
  let process: ReturnType<typeof createMaintenanceJobProcessor>

  beforeEach(() => {
    vi.clearAllMocks()
    deps = makeDeps()
    process = createMaintenanceJobProcessor(deps as unknown as MaintenanceDeps)
  })

  describe('varredura de 5 minutos', () => {
    it('executa expiração ANTES dos pendentes (PENDING recém-expirado é deletado, não despachado)', async () => {
      await process(makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP))

      expect(deps.maintenance.sweepExpiredEvents).toHaveBeenCalledOnce()
      expect(deps.processor.processPendingEvents).toHaveBeenCalledOnce()

      const sweepOrder = deps.maintenance.sweepExpiredEvents.mock.invocationCallOrder[0]
      const pendingOrder = deps.processor.processPendingEvents.mock.invocationCallOrder[0]
      expect(sweepOrder).toBeLessThan(pendingOrder)

      expect(deps.processor.processStuckSendingEvents).not.toHaveBeenCalled()
      expect(deps.maintenance.purgeOldEvents).not.toHaveBeenCalled()
    })

    /**
     * Invariante herdada do cron: uma fase que falha não impede a próxima de
     * rodar. Com a política de retentativa isso ficou mais sutil — o handler
     * lança SÓ depois que todas as fases tiveram sua chance, nunca na primeira
     * falha.
     */
    it('falha na expiração não impede o processamento dos pendentes', async () => {
      deps.maintenance.sweepExpiredEvents.mockRejectedValue(new Error('falha na varredura'))

      await expect(process(makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP))).rejects.toThrow('falha na varredura')

      expect(deps.processor.processPendingEvents).toHaveBeenCalledOnce()
    })

    it('conta uma execução por fase, com os rótulos que os painéis usam', async () => {
      await process(makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP))

      expect(mockRunsInc).toHaveBeenCalledWith({ phase: 'five_min_sweep' })
      expect(mockRunsInc).toHaveBeenCalledWith({ phase: 'five_min_pending' })
      expect(mockRunsInc).toHaveBeenCalledTimes(2)
    })
  })

  describe('varredura de meia-noite', () => {
    it('caminho feliz: duas fases em sequência, logs de início e fim, sem Sentry', async () => {
      await process(makeJob(QUEUE.JOBS.MIDNIGHT_SCAN))

      expect(deps.processor.processStuckSendingEvents).toHaveBeenCalledOnce()
      expect(deps.processor.processPendingEvents).toHaveBeenCalledOnce()

      const recoveryOrder = deps.processor.processStuckSendingEvents.mock.invocationCallOrder[0]
      const pendingOrder = deps.processor.processPendingEvents.mock.invocationCallOrder[0]
      expect(recoveryOrder).toBeLessThan(pendingOrder)

      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.CRON_START)
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PHASE1_DONE)
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PHASE2_DONE)
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCAN_DONE)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('na última tentativa, ambas as fases falhando reportam ao Sentry uma vez cada, com seu contexto', async () => {
      const phase1Error = new Error('falha 1')
      const phase2Error = new Error('falha 2')
      deps.processor.processStuckSendingEvents.mockRejectedValue(phase1Error)
      deps.processor.processPendingEvents.mockRejectedValue(phase2Error)

      await expect(process(lastAttempt(QUEUE.JOBS.MIDNIGHT_SCAN))).resolves.toBeUndefined()

      expect(mockCaptureError).toHaveBeenCalledTimes(2)
      expect(mockCaptureError).toHaveBeenNthCalledWith(1, phase1Error, { phase: 1 })
      expect(mockCaptureError).toHaveBeenNthCalledWith(2, phase2Error, { phase: 2 })
      expect(logger.error).toHaveBeenCalledWith({ error: phase1Error }, OUTBOX_LOGS.PHASE1_ERROR)
      expect(logger.error).toHaveBeenCalledWith({ error: phase2Error }, OUTBOX_LOGS.PHASE2_ERROR)
    })

    it('sempre registra o fim da varredura, mesmo quando uma fase falhou', async () => {
      deps.processor.processStuckSendingEvents.mockRejectedValue(new Error('falha'))

      await expect(process(lastAttempt(QUEUE.JOBS.MIDNIGHT_SCAN))).resolves.toBeUndefined()

      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCAN_DONE)
    })
  })

  describe('retenções diárias', () => {
    it('03:00 purga apenas eventos antigos da outbox', async () => {
      await process(makeJob(QUEUE.JOBS.RETENTION_PURGE))

      expect(deps.maintenance.purgeOldEvents).toHaveBeenCalledOnce()
      expect(deps.maintenance.sweepExpiredEvents).not.toHaveBeenCalled()
      expect(deps.processor.processPendingEvents).not.toHaveBeenCalled()
      expect(deps.analyticsRetention.purgeExpiredData).not.toHaveBeenCalled()
      expect(mockRunsInc).toHaveBeenCalledWith({ phase: 'retention_purge' })
    })

    it('04:00 purga apenas analytics, sem tocar na outbox', async () => {
      await process(makeJob(QUEUE.JOBS.ANALYTICS_RETENTION))

      expect(deps.analyticsRetention.purgeExpiredData).toHaveBeenCalledOnce()
      expect(deps.maintenance.purgeOldEvents).not.toHaveBeenCalled()
      expect(mockRunsInc).toHaveBeenCalledWith({ phase: 'analytics_retention' })
    })

    it('05:00 purga eventos com falha definitiva da outbox', async () => {
      await process(makeJob(QUEUE.JOBS.FAILED_JOBS_CLEANUP))

      expect(deps.maintenance.purgeFailedEvents).toHaveBeenCalledOnce()
      expect(deps.maintenance.purgeOldEvents).not.toHaveBeenCalled()
      expect(deps.maintenance.sweepExpiredEvents).not.toHaveBeenCalled()
      expect(deps.processor.processPendingEvents).not.toHaveBeenCalled()
      expect(deps.analyticsRetention.purgeExpiredData).not.toHaveBeenCalled()
      expect(mockRunsInc).toHaveBeenCalledWith({ phase: 'failed_jobs_cleanup' })
    })

    it('na última tentativa, a falha da purga de analytics usa a mensagem de analytics e captura sem contexto', async () => {
      const purgeError = new Error('falha na retenção de analytics')
      deps.analyticsRetention.purgeExpiredData.mockRejectedValue(purgeError)

      await expect(process(lastAttempt(QUEUE.JOBS.ANALYTICS_RETENTION))).resolves.toBeUndefined()

      expect(logger.error).toHaveBeenCalledWith({ error: purgeError }, ANALYTICS_LOGS.RETENTION_ERROR)
      // Aridade de UM argumento: `captureError(err, undefined)` é outra chamada.
      expect(mockCaptureError).toHaveBeenCalledWith(purgeError)
      expect(mockCaptureError.mock.calls[0]).toHaveLength(1)
    })
  })

  describe('política de falha do BullMQ', () => {
    it('falha RETENTÁVEL: lança para o BullMQ repetir, loga em warn e NÃO polui o Sentry', async () => {
      const sweepError = new Error('redis caiu')
      deps.maintenance.purgeOldEvents.mockRejectedValue(sweepError)

      await expect(process(makeJob(QUEUE.JOBS.RETENTION_PURGE, 0))).rejects.toThrow(sweepError)

      expect(mockFailuresInc).toHaveBeenCalledWith({ phase: 'retention_purge', outcome: 'retrying' })
      expect(logger.warn).toHaveBeenCalledWith(
        { error: sweepError, phase: 'retention_purge', attempt: 1 },
        OUTBOX_LOGS.MAINTENANCE_PHASE_RETRYING,
      )
      expect(mockCaptureError).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('falha PERMANENTE: na última tentativa engole o erro, loga em error e reporta ao Sentry', async () => {
      const purgeError = new Error('banco fora do ar')
      deps.maintenance.purgeOldEvents.mockRejectedValue(purgeError)

      await expect(process(lastAttempt(QUEUE.JOBS.RETENTION_PURGE))).resolves.toBeUndefined()

      expect(mockFailuresInc).toHaveBeenCalledWith({ phase: 'retention_purge', outcome: 'exhausted' })
      expect(logger.error).toHaveBeenCalledWith({ error: purgeError }, OUTBOX_LOGS.RETENTION_CRON_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(purgeError)
    })

    /**
     * Contrapeso dos dois acima: o limite tem de ser o do PRÓPRIO job, não a
     * constante. Um job com `attempts: 1` está na última tentativa já na
     * primeira execução — se o handler lesse a constante, ele lançaria aqui e o
     * Sentry nunca veria a falha.
     */
    it('respeita o limite de tentativas do job: com attempts=1 a primeira execução já é a última', async () => {
      const purgeError = new Error('falha única')
      deps.maintenance.purgeOldEvents.mockRejectedValue(purgeError)

      await expect(process(makeJob(QUEUE.JOBS.RETENTION_PURGE, 0, 1))).resolves.toBeUndefined()

      expect(mockCaptureError).toHaveBeenCalledWith(purgeError)
      expect(mockFailuresInc).toHaveBeenCalledWith({ phase: 'retention_purge', outcome: 'exhausted' })
    })

    it('sem attempts declarado, trata a execução como única (nada a repetir)', async () => {
      const purgeError = new Error('falha sem attempts')
      deps.maintenance.purgeOldEvents.mockRejectedValue(purgeError)
      const job = { ...makeJob(QUEUE.JOBS.RETENTION_PURGE), opts: {} } as unknown as Job<IMaintenanceJobData>

      await expect(process(job)).resolves.toBeUndefined()

      expect(mockCaptureError).toHaveBeenCalledWith(purgeError)
    })

    it('duas fases falhando numa tentativa retentável sobem como AggregateError, sem perder nenhuma', async () => {
      const phase1Error = new Error('falha 1')
      const phase2Error = new Error('falha 2')
      deps.processor.processStuckSendingEvents.mockRejectedValue(phase1Error)
      deps.processor.processPendingEvents.mockRejectedValue(phase2Error)

      await expect(process(makeJob(QUEUE.JOBS.MIDNIGHT_SCAN, 0))).rejects.toThrow(AggregateError)

      await expect(process(makeJob(QUEUE.JOBS.MIDNIGHT_SCAN, 0))).rejects.toMatchObject({
        errors: [phase1Error, phase2Error],
      })
    })

    it('uma única falha sobe como ela mesma, preservando a identidade do erro', async () => {
      const pendingError = new Error('só os pendentes falharam')
      deps.processor.processPendingEvents.mockRejectedValue(pendingError)

      await expect(process(makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP, 0))).rejects.toBe(pendingError)
    })

    it('sucesso não conta falha nem lança', async () => {
      await expect(process(makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP))).resolves.toBeUndefined()

      expect(mockFailuresInc).not.toHaveBeenCalled()
    })
  })

  /**
   * Reentrega idempotente: o BullMQ pode reentregar o mesmo job (retentativa,
   * job travado, segundo pod). As varreduras são idempotentes e protegidas por
   * DistributedLock, então o handler não deduplica — ele apenas re-executa, e é
   * isso que este teste fixa: mesma entrada, mesmo efeito, sem erro.
   */
  describe('reentrega idempotente', () => {
    it('processar o mesmo job duas vezes apenas re-executa as fases, sem lançar', async () => {
      const job = makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP)

      await expect(process(job)).resolves.toBeUndefined()
      await expect(process(job)).resolves.toBeUndefined()

      expect(deps.maintenance.sweepExpiredEvents).toHaveBeenCalledTimes(2)
      expect(deps.processor.processPendingEvents).toHaveBeenCalledTimes(2)
      expect(mockRunsInc).toHaveBeenCalledTimes(4)
    })

    it('uma retentativa após falha parcial re-executa as DUAS fases (ambas são idempotentes)', async () => {
      deps.processor.processPendingEvents.mockRejectedValueOnce(new Error('falha transitória'))

      await expect(process(makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP, 0))).rejects.toThrow('falha transitória')
      await expect(process(makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP, 1))).resolves.toBeUndefined()

      expect(deps.maintenance.sweepExpiredEvents).toHaveBeenCalledTimes(2)
      expect(deps.processor.processPendingEvents).toHaveBeenCalledTimes(2)
    })
  })

  /**
   * Os logs de abertura/fechamento da varredura pertencem SÓ à meia-noite.
   * Sem estas asserções negativas, um handler que logasse "varredura iniciada"
   * em toda purga diária passaria despercebido — e o log é o que um humano lê
   * às 3 da manhã para saber o que rodou.
   */
  describe('logs exclusivos da meia-noite', () => {
    it.each([
      ['varredura de 5 min', QUEUE.JOBS.FIVE_MIN_SWEEP],
      ['retenção da outbox', QUEUE.JOBS.RETENTION_PURGE],
      ['retenção de analytics', QUEUE.JOBS.ANALYTICS_RETENTION],
    ])('%s não registra início nem fim de varredura de segurança', async (_label, jobName) => {
      await process(makeJob(jobName))

      expect(logger.info).not.toHaveBeenCalledWith(OUTBOX_LOGS.CRON_START)
      expect(logger.info).not.toHaveBeenCalledWith(OUTBOX_LOGS.SCAN_DONE)
    })

    /**
     * Contrapeso: as asserções negativas acima seriam satisfeitas por um
     * handler que nunca logasse nada.
     */
    it('a meia-noite registra os dois, nesta ordem', async () => {
      await process(makeJob(QUEUE.JOBS.MIDNIGHT_SCAN))

      const start = vi.mocked(logger.info).mock.calls.findIndex(([arg]) => arg === OUTBOX_LOGS.CRON_START)
      const done = vi.mocked(logger.info).mock.calls.findIndex(([arg]) => arg === OUTBOX_LOGS.SCAN_DONE)

      expect(start).toBeGreaterThanOrEqual(0)
      expect(done).toBeGreaterThan(start)
    })
  })

  /**
   * Só as fases da meia-noite declaram mensagem de sucesso. Uma fase sem ela
   * não pode logar `undefined`: além de ruído, um `logger.info(undefined)` é o
   * tipo de linha que some no agregador e leva a crer que nada rodou.
   */
  describe('mensagem de sucesso por fase', () => {
    it('fases sem mensagem de sucesso não logam nada ao terminar', async () => {
      await process(makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP))

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('contrapeso: as fases da meia-noite logam a sua mensagem de sucesso', async () => {
      await process(makeJob(QUEUE.JOBS.MIDNIGHT_SCAN))

      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PHASE1_DONE)
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PHASE2_DONE)
    })

    it('uma fase que falha não loga mensagem de sucesso', async () => {
      deps.processor.processStuckSendingEvents.mockRejectedValue(new Error('falhou'))

      await expect(process(lastAttempt(QUEUE.JOBS.MIDNIGHT_SCAN))).resolves.toBeUndefined()

      expect(logger.info).not.toHaveBeenCalledWith(OUTBOX_LOGS.PHASE1_DONE)
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PHASE2_DONE)
    })
  })

  describe('job desconhecido', () => {
    it('loga e retorna sem executar nada — nunca lança (lançar viraria retentativa eterna)', async () => {
      await expect(process(makeJob('job-que-nao-existe'))).resolves.toBeUndefined()

      expect(logger.warn).toHaveBeenCalledWith(
        { jobName: 'job-que-nao-existe', jobId: 'job-1' },
        OUTBOX_LOGS.MAINTENANCE_JOB_UNKNOWN,
      )
      expect(deps.maintenance.sweepExpiredEvents).not.toHaveBeenCalled()
      expect(deps.processor.processPendingEvents).not.toHaveBeenCalled()
      expect(deps.maintenance.purgeOldEvents).not.toHaveBeenCalled()
      expect(deps.analyticsRetention.purgeExpiredData).not.toHaveBeenCalled()
      expect(mockRunsInc).not.toHaveBeenCalled()
    })
  })
})

describe('startMaintenanceWorker', () => {
  it('instancia o Worker com queue maintenance e loga início', () => {
    const deps = makeDeps()
    const worker = startMaintenanceWorker(deps as unknown as MaintenanceDeps)

    expect(mockAttachRedisLogger).toHaveBeenCalledWith(expect.anything(), 'MaintenanceWorker')
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      QUEUE.NAMES.MAINTENANCE,
      expect.any(Function),
      expect.objectContaining({
        connection: expect.anything(),
        concurrency: WORKER_CONSTANTS.MAINTENANCE.CONCURRENCY_LIMIT,
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.MAINTENANCE_WORKER_STARTED)
    expect(worker).toBeDefined()
  })
})
