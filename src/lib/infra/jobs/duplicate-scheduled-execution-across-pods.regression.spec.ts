/**
 * Regressão — "a manutenção agendada roda N vezes com N pods".
 *
 * O QUE QUEBRAVA: os quatro agendamentos viviam em `node-cron` DENTRO do
 * processo do worker. Cada pod que subia registrava seus próprios timers, então
 * com N pods a varredura de 5 min, a de meia-noite e as duas retenções diárias
 * disparavam N vezes por tique. O `DistributedLock` impedia o processamento
 * duplicado, mas ao custo de N-1 execuções disputando o mesmo lock no Redis e
 * no banco — e a única saída registrada no código era "implementar eleição de
 * líder" (o alerta de escalabilidade horizontal em `worker.ts`).
 *
 * POR QUE IMPORTAVA: é a razão pela qual o serviço não podia escalar
 * horizontalmente. Não era um bug latente em produção com um pod, era um teto.
 *
 * DEFEITO: plano de reúso de dependências, Finding A2 / Fase 3 —
 * `docs/history/dependency-reuse-refactor-plan.md`.
 *
 * A CORREÇÃO: os agendamentos passaram a ser Job Schedulers do BullMQ, que
 * vivem no Redis. Todo pod faz upsert do MESMO id; o BullMQ mantém um único
 * agendador e emite um job por tique, consumido por um único worker.
 *
 * Este spec fixa a propriedade no nível da unidade; a contraparte contra um
 * Redis real — onde quatro agendadores continuam quatro depois de dois pods
 * agendarem, e um tique produz um job — está em
 * `maintenance-scheduler.redis-integration.spec.ts`, e foi vista vermelha
 * (8 jobs em vez de 4) com a duplicação por pod reinjetada.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@lib/queue/maintenance-queue', () => ({
  getMaintenanceQueue: vi.fn(),
}))

import { startMaintenanceScheduler } from './maintenance-scheduler'
import { createMaintenanceJobProcessor, MaintenanceDeps } from './maintenance-worker'
import { QUEUE } from 'messages/constants/queue/queue'
import type { Queue } from 'bullmq'
import type { Job } from 'bullmq'
import type { IMaintenanceJobData } from 'core/contracts/lib/infra/maintenance-job-data.interface'

/**
 * Um Redis de mentira que guarda agendadores por id, que é exatamente a
 * semântica que o BullMQ dá ao `upsertJobScheduler`: upsert, não insert.
 */
function makeSharedRedis() {
  const schedulers = new Map<string, { pattern?: string; jobName?: string }>()

  const makePod = () =>
    ({
      upsertJobScheduler: vi.fn(async (id: string, opts: { pattern?: string }, template?: { name?: string }) => {
        schedulers.set(id, { pattern: opts.pattern, jobName: template?.name })
      }),
    }) as unknown as Queue<IMaintenanceJobData>

  return { schedulers, makePod }
}

function makeDeps() {
  return {
    processor: {
      processStuckSendingEvents: vi.fn().mockResolvedValue(undefined),
      processPendingEvents: vi.fn().mockResolvedValue(undefined),
    },
    maintenance: {
      sweepExpiredEvents: vi.fn().mockResolvedValue(undefined),
      purgeOldEvents: vi.fn().mockResolvedValue(undefined),
    },
    analyticsRetention: { purgeExpiredData: vi.fn().mockResolvedValue(undefined) },
  }
}

describe('regressão: execução agendada duplicada entre pods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * O SINTOMA. Com `node-cron`, três pods produziam três conjuntos de timers —
   * doze agendamentos no total. Agendadores desduplicados por id mantêm quatro,
   * não importa quantos pods subam.
   */
  it('três pods agendando resultam em QUATRO agendadores, não doze', async () => {
    const { schedulers, makePod } = makeSharedRedis()

    await startMaintenanceScheduler(makePod())
    await startMaintenanceScheduler(makePod())
    await startMaintenanceScheduler(makePod())

    expect(schedulers.size).toBe(4)
    expect([...schedulers.keys()].sort()).toEqual(
      [
        QUEUE.SCHEDULER_IDS.FIVE_MIN_SWEEP,
        QUEUE.SCHEDULER_IDS.MIDNIGHT_SCAN,
        QUEUE.SCHEDULER_IDS.RETENTION_PURGE,
        QUEUE.SCHEDULER_IDS.ANALYTICS_RETENTION,
      ].sort(),
    )
  })

  /**
   * A causa raiz, não só o sintoma: agendar não pode EXECUTAR nada no processo
   * que agendou. Era isso que o cron fazia — o callback fechava sobre o
   * processor e rodava a varredura localmente, e é por isso que N pods
   * significavam N execuções.
   */
  it('agendar não executa trabalho algum no processo que agendou', async () => {
    const { makePod } = makeSharedRedis()
    const deps = makeDeps()

    await startMaintenanceScheduler(makePod())
    await startMaintenanceScheduler(makePod())

    expect(deps.maintenance.sweepExpiredEvents).not.toHaveBeenCalled()
    expect(deps.maintenance.purgeOldEvents).not.toHaveBeenCalled()
    expect(deps.processor.processPendingEvents).not.toHaveBeenCalled()
    expect(deps.processor.processStuckSendingEvents).not.toHaveBeenCalled()
    expect(deps.analyticsRetention.purgeExpiredData).not.toHaveBeenCalled()
  })

  /**
   * CONTRAPESO do teste acima: "não executa nada ao agendar" é satisfeito
   * trivialmente por um sistema que nunca executa nada. Este fixa a outra
   * metade — entregue o job e o trabalho acontece, uma vez por entrega.
   */
  it('contrapeso: a entrega do job executa o trabalho exatamente uma vez', async () => {
    const deps = makeDeps()
    const process = createMaintenanceJobProcessor(deps as unknown as MaintenanceDeps)
    const job = {
      id: 'job-1',
      name: QUEUE.JOBS.FIVE_MIN_SWEEP,
      data: {},
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job<IMaintenanceJobData>

    await process(job)

    expect(deps.maintenance.sweepExpiredEvents).toHaveBeenCalledOnce()
    expect(deps.processor.processPendingEvents).toHaveBeenCalledOnce()
  })
})
