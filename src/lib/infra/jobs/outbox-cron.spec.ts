import { vi, describe, it, expect, beforeEach } from 'vitest'

let scheduledTask: (() => Promise<void>) | null = null

vi.mock('node-cron', () => ({
  default: {
    schedule: (_expr: string, task: () => Promise<void>) => {
      scheduledTask = task
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

// Evita instanciar o PrismaClient real: startOutboxCron só constrói um processor
// próprio quando nenhum é passado, e os testes sempre passam um mock.
vi.mock('@lib/prisma', () => ({ prisma: {} }))

import { startOutboxCron } from './outbox-cron'
import { OutboxProcessor } from './outbox-processor'
import { logger } from '@lib/logger'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'

function makeProcessor() {
  return {
    recoverStuckSendingEvents: vi.fn().mockResolvedValue(undefined),
    processEvents: vi.fn().mockResolvedValue(undefined),
  } as unknown as OutboxProcessor
}

describe('startOutboxCron', () => {
  let processor: ReturnType<typeof makeProcessor>

  beforeEach(() => {
    vi.clearAllMocks()
    scheduledTask = null
    processor = makeProcessor()
    startOutboxCron(processor)
  })

  it('registra o agendador e loga a configuração', () => {
    expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCHEDULER_CONFIGURED)
    expect(scheduledTask).toBeTypeOf('function')
  })

  it('caminho feliz: executa as duas fases em sequência, sem erros nem captura no Sentry', async () => {
    await scheduledTask!()

    expect(processor.recoverStuckSendingEvents).toHaveBeenCalledOnce()
    expect(processor.processEvents).toHaveBeenCalledOnce()
    expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PHASE1_DONE)
    expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PHASE2_DONE)
    expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCAN_DONE)
    expect(mockCaptureError).not.toHaveBeenCalled()
  })

  it('fase 1 falha: loga PHASE1_ERROR, captura no Sentry e ainda executa a fase 2', async () => {
    const phase1Error = new Error('falha na recuperação')
    processor.recoverStuckSendingEvents = vi.fn().mockRejectedValue(phase1Error)

    await scheduledTask!()

    expect(logger.error).toHaveBeenCalledWith({ error: phase1Error }, OUTBOX_LOGS.PHASE1_ERROR)
    expect(mockCaptureError).toHaveBeenCalledWith(phase1Error, { phase: 1 })
    expect(processor.processEvents).toHaveBeenCalledOnce()
    expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCAN_DONE)
  })

  it('fase 2 falha: loga PHASE2_ERROR e captura no Sentry, sem impedir o término da varredura', async () => {
    const phase2Error = new Error('falha ao processar pendentes')
    processor.processEvents = vi.fn().mockRejectedValue(phase2Error)

    await scheduledTask!()

    expect(logger.error).toHaveBeenCalledWith({ error: phase2Error }, OUTBOX_LOGS.PHASE2_ERROR)
    expect(mockCaptureError).toHaveBeenCalledWith(phase2Error, { phase: 2 })
    expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SCAN_DONE)
  })

  it('ambas as fases falham: captura no Sentry duas vezes, uma por fase', async () => {
    const phase1Error = new Error('falha 1')
    const phase2Error = new Error('falha 2')
    processor.recoverStuckSendingEvents = vi.fn().mockRejectedValue(phase1Error)
    processor.processEvents = vi.fn().mockRejectedValue(phase2Error)

    await scheduledTask!()

    expect(mockCaptureError).toHaveBeenCalledTimes(2)
    expect(mockCaptureError).toHaveBeenNthCalledWith(1, phase1Error, { phase: 1 })
    expect(mockCaptureError).toHaveBeenNthCalledWith(2, phase2Error, { phase: 2 })
  })
})
