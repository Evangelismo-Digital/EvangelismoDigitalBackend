import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockGetMaintenanceQueue = vi.fn()

vi.mock('@lib/queue/maintenance-queue', () => ({
  getMaintenanceQueue: () => mockGetMaintenanceQueue(),
}))

import { startMaintenanceScheduler } from './maintenance-scheduler'
import { logger } from '@lib/logger'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'
import { CRON_SCHEDULES } from 'messages/constants/cron/cron'
import { QUEUE } from 'messages/constants/queue/queue'
import type { Queue } from 'bullmq'
import type { IMaintenanceJobData } from 'core/contracts/lib/infra/maintenance-job-data.interface'

type UpsertCall = [string, { pattern?: string }, { name?: string; data?: IMaintenanceJobData } | undefined]

function makeQueue() {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue<IMaintenanceJobData>
}

function upsertCalls(queue: Queue<IMaintenanceJobData>): UpsertCall[] {
  return vi.mocked(queue.upsertJobScheduler).mock.calls as unknown as UpsertCall[]
}

describe('startMaintenanceScheduler', () => {
  let queue: ReturnType<typeof makeQueue>

  beforeEach(() => {
    vi.clearAllMocks()
    queue = makeQueue()
  })

  /**
   * A asserção é a lista COMPLETA de (id, padrão, nome do job), não um
   * `toContain`: herdada do spec do node-cron, ela vale justamente por falhar
   * quando alguém acrescenta um agendamento sem pensar no horário — duas
   * deleções em lote sobrepostas disputam a mesma I/O na única janela em que
   * qualquer uma delas pode se dar ao luxo de ser lenta.
   */
  it('registra exatamente os cinco agendadores, cada um com seu id estável, padrão e nome de job', async () => {
    await startMaintenanceScheduler(queue)

    expect(upsertCalls(queue).map(([id, opts, template]) => [id, opts.pattern, template?.name])).toEqual([
      [QUEUE.SCHEDULER_IDS.FIVE_MIN_SWEEP, CRON_SCHEDULES.EVERY_FIVE_MINUTES, QUEUE.JOBS.FIVE_MIN_SWEEP],
      [QUEUE.SCHEDULER_IDS.MIDNIGHT_SCAN, CRON_SCHEDULES.MIDNIGHT_DAILY, QUEUE.JOBS.MIDNIGHT_SCAN],
      [QUEUE.SCHEDULER_IDS.RETENTION_PURGE, CRON_SCHEDULES.DAILY_3AM, QUEUE.JOBS.RETENTION_PURGE],
      [QUEUE.SCHEDULER_IDS.ANALYTICS_RETENTION, CRON_SCHEDULES.DAILY_4AM, QUEUE.JOBS.ANALYTICS_RETENTION],
      [QUEUE.SCHEDULER_IDS.FAILED_JOBS_CLEANUP, CRON_SCHEDULES.DAILY_5AM, QUEUE.JOBS.FAILED_JOBS_CLEANUP],
    ])
  })

  it('loga a configuração concluída', async () => {
    await startMaintenanceScheduler(queue)

    expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCHEDULER_CONFIGURED)
  })

  /**
   * Contrapeso do teste acima: a retenção da outbox (03:00), a de analytics
   * (04:00) e a de falhas (05:00) são agendadores SEPARADOS. Juntá-las num só
   * job é a regressão que este teste existe para pegar.
   */
  it('mantém as retenções diárias como agendadores distintos, com uma hora entre elas', async () => {
    await startMaintenanceScheduler(queue)

    const patternsById = new Map(upsertCalls(queue).map(([id, opts]) => [id, opts.pattern]))

    expect(patternsById.get(QUEUE.SCHEDULER_IDS.RETENTION_PURGE)).toBe(CRON_SCHEDULES.DAILY_3AM)
    expect(patternsById.get(QUEUE.SCHEDULER_IDS.ANALYTICS_RETENTION)).toBe(CRON_SCHEDULES.DAILY_4AM)
    expect(patternsById.get(QUEUE.SCHEDULER_IDS.FAILED_JOBS_CLEANUP)).toBe(CRON_SCHEDULES.DAILY_5AM)
    expect(CRON_SCHEDULES.DAILY_3AM).not.toBe(CRON_SCHEDULES.DAILY_4AM)
    expect(CRON_SCHEDULES.DAILY_4AM).not.toBe(CRON_SCHEDULES.DAILY_5AM)
  })

  /**
   * Informar `tz` MOVERIA as janelas em produção: o contêiner roda em UTC e o
   * cron-parser do BullMQ, como o node-cron antes dele, resolve o padrão no
   * fuso local do processo. Preservar o comportamento era o requisito da
   * migração, então a ausência do campo é asserção, não descuido.
   */
  it('não informa fuso horário, preservando a resolução no fuso local do processo', async () => {
    await startMaintenanceScheduler(queue)

    for (const [, repeatOpts] of upsertCalls(queue)) {
      expect(repeatOpts).not.toHaveProperty('tz')
    }
  })

  it('carimba o id do agendador no payload do job, para diagnóstico', async () => {
    await startMaintenanceScheduler(queue)

    for (const [schedulerId, , template] of upsertCalls(queue)) {
      expect(template?.data).toEqual({ schedulerId })
    }
  })

  /**
   * O coração da fase 3: o upsert é idempotente por id. Chamar a função em todo
   * boot de todo pod tem de reescrever a MESMA configuração, nunca acumular
   * agendadores — é isso que substitui a eleição de líder.
   */
  it('é idempotente: chamar duas vezes reescreve os mesmos cinco ids, sem criar novos', async () => {
    await startMaintenanceScheduler(queue)
    await startMaintenanceScheduler(queue)

    const ids = upsertCalls(queue).map(([id]) => id)

    expect(ids).toHaveLength(10)
    expect(new Set(ids).size).toBe(5)
  })

  it('propaga a falha do upsert em vez de anunciar agendadores que não existem', async () => {
    const upsertError = new Error('redis indisponível')
    queue.upsertJobScheduler = vi.fn().mockRejectedValue(upsertError)

    await expect(startMaintenanceScheduler(queue)).rejects.toThrow(upsertError)
    expect(logger.info).not.toHaveBeenCalledWith(OUTBOX_LOGS.SCHEDULER_CONFIGURED)
  })

  it('usa a fila de manutenção compartilhada quando nenhuma é injetada', async () => {
    mockGetMaintenanceQueue.mockReturnValue(queue)

    await startMaintenanceScheduler()

    expect(mockGetMaintenanceQueue).toHaveBeenCalledOnce()
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(5)
  })
})
