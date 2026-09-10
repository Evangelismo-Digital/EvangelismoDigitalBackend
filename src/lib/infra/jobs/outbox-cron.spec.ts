import { vi, describe, it, expect, beforeEach } from 'vitest'

const scheduledTasks = new Map<string, () => Promise<void>>()

vi.mock('node-cron', () => ({
  default: {
    schedule: (expr: string, task: () => Promise<void>) => {
      scheduledTasks.set(expr, task)
    },
  },
}))

vi.mock('@lib/logger', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger }
})

const mockCaptureError = vi.fn()

vi.mock('@lib/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

// Evita instanciar o PrismaClient real: startOutboxCron só constrói processor e
// maintenance próprios quando nenhum é passado, e os testes sempre passam mocks.
vi.mock('@lib/prisma', () => ({ prisma: {} }))

import { startOutboxCron } from './outbox-cron'
import { OutboxProcessor } from './outbox-processor'
import { OutboxMaintenance } from './outbox-maintenance'
import { logger } from '@lib/logger'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'
import { CRON_SCHEDULES } from 'messages/constants/cron/cron'

function makeProcessor() {
  return {
    processStuckSendingEvents: vi.fn().mockResolvedValue(undefined),
    processPendingEvents: vi.fn().mockResolvedValue(undefined),
  } as unknown as OutboxProcessor
}

function makeMaintenance() {
  return {
    sweepExpiredEvents: vi.fn().mockResolvedValue(undefined),
    purgeOldEvents: vi.fn().mockResolvedValue(undefined),
  } as unknown as OutboxMaintenance
}

describe('startOutboxCron', () => {
  let processor: ReturnType<typeof makeProcessor>
  let maintenance: ReturnType<typeof makeMaintenance>

  beforeEach(() => {
    vi.clearAllMocks()
    scheduledTasks.clear()
    processor = makeProcessor()
    maintenance = makeMaintenance()
    startOutboxCron(processor, maintenance)
  })

  /**
   * Passou de TRÊS para QUATRO agendadores — mudança deliberada, não um ajuste
   * para o teste passar: a retenção de analytics (§5.3) entrou às 04:00, uma
   * hora depois da purga da outbox, porque as duas são deleções em lote no mesmo
   * banco e sobrepô-las colocaria dois loops longos disputando a mesma I/O na
   * única janela em que qualquer uma delas pode se dar ao luxo de ser lenta.
   *
   * A asserção continua sendo a lista COMPLETA, e não um `toContain`: o valor
   * dela está em falhar quando alguém adiciona um cron sem pensar no horário.
   */
  it('registra os quatro agendadores (5 min, meia-noite, retenção 03:00 e analytics 04:00) e loga a configuração', () => {
    expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCHEDULER_CONFIGURED)
    expect([...scheduledTasks.keys()].sort()).toEqual(
      [
        CRON_SCHEDULES.EVERY_FIVE_MINUTES,
        CRON_SCHEDULES.MIDNIGHT_DAILY,
        CRON_SCHEDULES.DAILY_3AM,
        CRON_SCHEDULES.DAILY_4AM,
      ].sort(),
    )
  })

  it('agenda a retenção de analytics separadamente da purga da outbox', async () => {
    const analyticsRetention = { purgeExpiredData: vi.fn().mockResolvedValue(undefined) }
    scheduledTasks.clear()
    startOutboxCron(processor, maintenance, analyticsRetention as never)

    await scheduledTasks.get(CRON_SCHEDULES.DAILY_4AM)!()

    expect(analyticsRetention.purgeExpiredData).toHaveBeenCalledOnce()
    // 03:00 continua sendo só da outbox.
    expect(maintenance.purgeOldEvents).not.toHaveBeenCalled()
  })

  describe('varredura de 5 minutos', () => {
    it('executa expiração ANTES dos pendentes (PENDING recém-expirado é deletado, não despachado)', async () => {
      await scheduledTasks.get(CRON_SCHEDULES.EVERY_FIVE_MINUTES)!()

      expect(maintenance.sweepExpiredEvents).toHaveBeenCalledOnce()
      expect(processor.processPendingEvents).toHaveBeenCalledOnce()

      const sweepOrder = vi.mocked(maintenance.sweepExpiredEvents).mock.invocationCallOrder[0]
      const pendingOrder = vi.mocked(processor.processPendingEvents).mock.invocationCallOrder[0]
      expect(sweepOrder).toBeLessThan(pendingOrder)

      // não roda recuperação de SENDING nem retenção
      expect(processor.processStuckSendingEvents).not.toHaveBeenCalled()
      expect(maintenance.purgeOldEvents).not.toHaveBeenCalled()
    })

    it('falha na expiração não impede o processamento dos pendentes', async () => {
      const sweepError = new Error('falha na varredura')
      maintenance.sweepExpiredEvents = vi.fn().mockRejectedValue(sweepError)

      await scheduledTasks.get(CRON_SCHEDULES.EVERY_FIVE_MINUTES)!()

      expect(logger.error).toHaveBeenCalledWith({ error: sweepError }, OUTBOX_LOGS.FIVE_MIN_SWEEP_EXPIRY_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(sweepError)
      expect(processor.processPendingEvents).toHaveBeenCalledOnce()
    })

    it('falha nos pendentes é logada e capturada sem lançar', async () => {
      const pendingError = new Error('falha nos pendentes')
      processor.processPendingEvents = vi.fn().mockRejectedValue(pendingError)

      await expect(scheduledTasks.get(CRON_SCHEDULES.EVERY_FIVE_MINUTES)!()).resolves.toBeUndefined()

      expect(logger.error).toHaveBeenCalledWith({ error: pendingError }, OUTBOX_LOGS.FIVE_MIN_SWEEP_PENDING_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(pendingError)
    })
  })

  describe('varredura de meia-noite', () => {
    it('caminho feliz: executa as duas fases em sequência, sem erros nem captura no Sentry', async () => {
      await scheduledTasks.get(CRON_SCHEDULES.MIDNIGHT_DAILY)!()

      expect(processor.processStuckSendingEvents).toHaveBeenCalledOnce()
      expect(processor.processPendingEvents).toHaveBeenCalledOnce()
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PHASE1_DONE)
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PHASE2_DONE)
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCAN_DONE)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('fase 1 falha: loga PHASE1_ERROR, captura no Sentry e ainda executa a fase 2', async () => {
      const phase1Error = new Error('falha na recuperação')
      processor.processStuckSendingEvents = vi.fn().mockRejectedValue(phase1Error)

      await scheduledTasks.get(CRON_SCHEDULES.MIDNIGHT_DAILY)!()

      expect(logger.error).toHaveBeenCalledWith({ error: phase1Error }, OUTBOX_LOGS.PHASE1_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(phase1Error, { phase: 1 })
      expect(processor.processPendingEvents).toHaveBeenCalledOnce()
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCAN_DONE)
    })

    it('fase 2 falha: loga PHASE2_ERROR e captura no Sentry, sem impedir o término da varredura', async () => {
      const phase2Error = new Error('falha ao processar pendentes')
      processor.processPendingEvents = vi.fn().mockRejectedValue(phase2Error)

      await scheduledTasks.get(CRON_SCHEDULES.MIDNIGHT_DAILY)!()

      expect(logger.error).toHaveBeenCalledWith({ error: phase2Error }, OUTBOX_LOGS.PHASE2_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(phase2Error, { phase: 2 })
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCAN_DONE)
    })

    it('ambas as fases falham: captura no Sentry duas vezes, uma por fase', async () => {
      const phase1Error = new Error('falha 1')
      const phase2Error = new Error('falha 2')
      processor.processStuckSendingEvents = vi.fn().mockRejectedValue(phase1Error)
      processor.processPendingEvents = vi.fn().mockRejectedValue(phase2Error)

      await scheduledTasks.get(CRON_SCHEDULES.MIDNIGHT_DAILY)!()

      expect(mockCaptureError).toHaveBeenCalledTimes(2)
      expect(mockCaptureError).toHaveBeenNthCalledWith(1, phase1Error, { phase: 1 })
      expect(mockCaptureError).toHaveBeenNthCalledWith(2, phase2Error, { phase: 2 })
    })
  })

  describe('retenção diária (03:00)', () => {
    it('executa apenas a purga de eventos antigos', async () => {
      await scheduledTasks.get(CRON_SCHEDULES.DAILY_3AM)!()

      expect(maintenance.purgeOldEvents).toHaveBeenCalledOnce()
      expect(maintenance.sweepExpiredEvents).not.toHaveBeenCalled()
      expect(processor.processPendingEvents).not.toHaveBeenCalled()
    })

    it('falha na purga é logada e capturada sem lançar', async () => {
      const purgeError = new Error('falha na retenção')
      maintenance.purgeOldEvents = vi.fn().mockRejectedValue(purgeError)

      await expect(scheduledTasks.get(CRON_SCHEDULES.DAILY_3AM)!()).resolves.toBeUndefined()

      expect(logger.error).toHaveBeenCalledWith({ error: purgeError }, OUTBOX_LOGS.RETENTION_CRON_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(purgeError)
    })
  })
})
