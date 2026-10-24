import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
const mockWorkerConstructor = vi.fn()
const mockWorkerOn = vi.fn()

vi.mock('@config/env/index', () => ({
  env: {
    MAIL_RATE_LIMIT_MAX: 2,
    MAIL_RATE_LIMIT_DURATION_MS: 1000,
  },
}))

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>()
  return {
    ...actual,
    Worker: class {
      on = mockWorkerOn
      constructor(name: string, processor: unknown, opts: unknown) {
        mockWorkerConstructor(name, processor, opts)
      }
    },
  }
})

vi.mock('@infra/logger', () => {
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

const mockRedisSet = vi.fn()
const mockRedisGet = vi.fn()
const mockRedisDel = vi.fn()

vi.mock('@infra/redis/clients/clients', () => ({
  getRedisCache: () => ({ set: mockRedisSet, get: mockRedisGet, del: mockRedisDel }),
  createWorkerConnection: () => ({}),
}))

vi.mock('@infra/redis/connections/redis-bullMQ-connection', () => ({
  attachRedisLogger: vi.fn(),
}))

const mockSendEmailExecute = vi.fn()

vi.mock('@infra/mail/factories/make-send-email.service', () => ({
  makeSendEmailUseCase: () => ({ execute: mockSendEmailExecute }),
}))

const mockCaptureError = vi.fn()

vi.mock('@infra/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

const { mockSentInc, mockFailedInc, mockSkippedInc, mockDurationStartTimer, mockPermanentRejectionsInc, metricsState } =
  vi.hoisted(() => ({
    mockSentInc: vi.fn(),
    mockFailedInc: vi.fn(),
    mockSkippedInc: vi.fn(),
    mockDurationStartTimer: vi.fn(),
    mockPermanentRejectionsInc: vi.fn(),
    metricsState: { enabled: true },
  }))

vi.mock('@infra/metrics/email-metrics', () => ({
  get collectMetricsEmailsSent() {
    return metricsState.enabled ? { inc: (...args: unknown[]) => mockSentInc(...args) } : null
  },
  get collectMetricsEmailsFailed() {
    return metricsState.enabled ? { inc: (...args: unknown[]) => mockFailedInc(...args) } : null
  },
  get collectMetricsEmailsSkipped() {
    return metricsState.enabled ? { inc: (...args: unknown[]) => mockSkippedInc(...args) } : null
  },
  get collectMetricsEmailBatchDuration() {
    return metricsState.enabled ? { startTimer: () => mockDurationStartTimer() } : null
  },
  get collectMetricsEmailsPermanentRejections() {
    return metricsState.enabled ? { inc: (...args: unknown[]) => mockPermanentRejectionsInc(...args) } : null
  },
}))

import { Job, UnrecoverableError } from 'bullmq'
import {
  createMailJobProcessor,
  createJobFailureHandler,
  startMailWorker,
  isPermanentSmtpError,
  extractCandidates,
  isUnrecoverable,
} from './mail-worker'
import { IOutboxRepository, IOutboxEventStatus } from '@infra/outbox/repositories/outbox-repository.interface'
import { IOutboxDispatchData } from '@infra/outbox/interfaces/outbox-dispatch-data.interface'
import { ok, err } from '@common/utils/result'
import { SmtpDispatchError } from '@infra/mail/errors/smtp-dispatch-error'
import { JobAlreadyProcessingError } from '@infra/mail/errors/job-already-processing-error'
import { InfrastructureError } from '@common/errors/infrastructure-error'
import { logger } from '@infra/logger'
import { WORKER_LOGS } from '@common/messages/constants/logs/worker'
import { REDIS_CONSTANTS } from '@common/messages/constants/redis/redis'
import { WORKER_CONSTANTS } from '@common/messages/constants/workers/workers'
import { QUEUE } from '@common/messages/constants/queue/queue'
import { attachRedisLogger } from '@infra/redis/connections/redis-bullMQ-connection'

class InfraTestError extends InfrastructureError {
  constructor() {
    super({ code: 'INFRA_TEST_ERROR', message: 'falha de infra injetada' })
  }
}

const PUBLIC_ID = 'evt-123'
const IDEMPOTENCY_KEY = `${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${PUBLIC_ID}`

const emailUser = { to: 'user@test.com', subject: 'a', message: 'a', html: '<p>a</p>' }
const emailStaff = { to: 'staff@test.com', subject: 'b', message: 'b', html: '<p>b</p>' }

function makeJob(
  overrides?: Partial<{ emails: unknown[]; attemptsMade: number; attempts?: number; expiresAt: string }>,
) {
  return {
    id: 'job-1',
    data: {
      publicId: PUBLIC_ID,
      emails: overrides?.emails ?? [emailUser, emailStaff],
      ...(overrides?.expiresAt ? { expiresAt: overrides.expiresAt } : {}),
    },
    attemptsMade: overrides?.attemptsMade ?? 1,
    opts: { attempts: overrides && 'attempts' in overrides ? overrides.attempts : 3 },
    updateData: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<IOutboxDispatchData>
}

function makeRepository() {
  return {
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    updateStatus: vi.fn().mockResolvedValue(ok(undefined)),
    updatePendingRecipients: vi.fn().mockResolvedValue(ok(undefined)),
  }
}

describe('createMailJobProcessor', () => {
  let repository: ReturnType<typeof makeRepository>
  let processor: (job: Job<IOutboxDispatchData>) => Promise<void>

  beforeEach(() => {
    vi.clearAllMocks()
    repository = makeRepository()
    processor = createMailJobProcessor(repository as unknown as IOutboxRepository)

    mockRedisSet.mockResolvedValue('OK')
    mockRedisGet.mockResolvedValue(null)
    mockRedisDel.mockResolvedValue(1)
    mockSendEmailExecute.mockResolvedValue(ok({}))
    metricsState.enabled = true
    mockDurationStartTimer.mockReturnValue(vi.fn())
  })

  describe('gate de expiração', () => {
    it('job expirado: deleta a linha do outbox sem enviar e-mail e sem tocar na chave de idempotência', async () => {
      const expiresAt = new Date(Date.now() - 1000).toISOString()

      await expect(processor(makeJob({ expiresAt }))).resolves.toBeUndefined()

      expect(mockSendEmailExecute).not.toHaveBeenCalled()
      expect(mockRedisSet).not.toHaveBeenCalled()
      expect(mockRedisDel).not.toHaveBeenCalled()
      expect(repository.delete).toHaveBeenCalledWith(PUBLIC_ID)
      expect(logger.warn).toHaveBeenCalledWith(WORKER_LOGS.EXPIRED_JOB_SKIPPED)
    })

    it('job expirado com delete falhando: lança para o BullMQ re-tentar apenas o delete', async () => {
      const infraError = new InfraTestError()
      repository.delete.mockResolvedValueOnce(err(infraError))

      await expect(processor(makeJob({ expiresAt: new Date(Date.now() - 1000).toISOString() }))).rejects.toBe(
        infraError,
      )

      expect(mockSendEmailExecute).not.toHaveBeenCalled()
    })

    it('job com expiresAt futuro: processa normalmente', async () => {
      await processor(makeJob({ expiresAt: new Date(Date.now() + 60_000).toISOString() }))

      expect(mockSendEmailExecute).toHaveBeenCalledTimes(2)
      expect(repository.delete).toHaveBeenCalledWith(PUBLIC_ID)
    })

    it('job com expiresAt exatamente agora: considerado expirado', async () => {
      vi.useFakeTimers()
      const now = new Date('2026-10-15T12:00:00.000Z')
      vi.setSystemTime(now)

      await expect(processor(makeJob({ expiresAt: now.toISOString() }))).resolves.toBeUndefined()

      expect(mockSendEmailExecute).not.toHaveBeenCalled()
      expect(repository.delete).toHaveBeenCalledWith(PUBLIC_ID)
      vi.useRealTimers()
    })
  })

  describe('aquisição de idempotência', () => {
    it('job novo: adquire a chave com NX, valor processing e TTL de processamento', async () => {
      await processor(makeJob())

      expect(mockRedisSet).toHaveBeenNthCalledWith(
        1,
        IDEMPOTENCY_KEY,
        'processing',
        'EX',
        WORKER_CONSTANTS.IDEMPOTENCY_TTL.PROCESSING_SECONDS,
        'NX',
      )
    })

    it('chave já existe como completed: apenas deleta o outbox, sem reenviar e sem apagar a chave', async () => {
      mockRedisSet.mockResolvedValueOnce(null)
      mockRedisGet.mockResolvedValueOnce('completed')

      await processor(makeJob())

      expect(mockSendEmailExecute).not.toHaveBeenCalled()
      expect(repository.delete).toHaveBeenCalledWith(PUBLIC_ID)
      expect(mockRedisDel).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(WORKER_LOGS.BATCH_ALREADY_SENT)
    })

    it('chave completed e delete falha: lança para o BullMQ tentar a limpeza de novo, sem apagar a chave', async () => {
      mockRedisSet.mockResolvedValueOnce(null)
      mockRedisGet.mockResolvedValueOnce('completed')
      const infraError = new InfraTestError()
      repository.delete.mockResolvedValueOnce(err(infraError))

      await expect(processor(makeJob())).rejects.toBe(infraError)

      expect(mockSendEmailExecute).not.toHaveBeenCalled()
      expect(mockRedisDel).not.toHaveBeenCalled()
    })

    it('chave em processing por outro consumidor: lança JobAlreadyProcessingError sem enviar', async () => {
      mockRedisSet.mockResolvedValueOnce(null)
      mockRedisGet.mockResolvedValueOnce('processing')

      await expect(processor(makeJob())).rejects.toBeInstanceOf(JobAlreadyProcessingError)

      expect(mockSendEmailExecute).not.toHaveBeenCalled()
      expect(mockRedisDel).not.toHaveBeenCalled()
    })

    it('NX falha mas a chave expirou entre o SET e o GET: lança JobAlreadyProcessingError (comportamento documentado)', async () => {
      mockRedisSet.mockResolvedValueOnce(null)
      mockRedisGet.mockResolvedValueOnce(null)

      await expect(processor(makeJob())).rejects.toBeInstanceOf(JobAlreadyProcessingError)
    })
  })

  describe('fase de envio', () => {
    it('sucesso: envia todos, grava completed com TTL longo e só então deleta o outbox, sem apagar a chave', async () => {
      await processor(makeJob())

      expect(logger.child).toHaveBeenCalledWith({ jobId: 'job-1', publicId: PUBLIC_ID })
      expect(logger.info).toHaveBeenCalledWith('Processando lote de 2 e-mails...')
      expect(logger.info).toHaveBeenCalledWith('Lote de e-mails processado com sucesso.')
      expect(logger.info).toHaveBeenCalledWith('OutboxEvent deletado com sucesso do banco de dados')
      expect(mockSentInc).toHaveBeenCalledWith(2)

      expect(mockSendEmailExecute).toHaveBeenCalledTimes(2)
      expect(mockRedisSet).toHaveBeenNthCalledWith(
        2,
        IDEMPOTENCY_KEY,
        'completed',
        'EX',
        WORKER_CONSTANTS.IDEMPOTENCY_TTL.COMPLETED_SECONDS,
      )
      expect(repository.delete).toHaveBeenCalledWith(PUBLIC_ID)
      expect(mockRedisDel).not.toHaveBeenCalled()

      // ordem: completed gravado ANTES da deleção do outbox
      const completedOrder = mockRedisSet.mock.invocationCallOrder[1]
      const deleteOrder = repository.delete.mock.invocationCallOrder[0]
      expect(completedOrder).toBeLessThan(deleteOrder)
    })

    it('lote com um único e-mail (formato do password-reset) funciona', async () => {
      await processor(makeJob({ emails: [emailUser] }))

      expect(mockSendEmailExecute).toHaveBeenCalledTimes(1)
      expect(repository.delete).toHaveBeenCalledWith(PUBLIC_ID)
    })

    it('falha parcial (primeiro falha, segundo envia): apaga a chave processing, relança e não deleta o outbox', async () => {
      const smtpError = new SmtpDispatchError(new Error('smtp caiu'))
      mockSendEmailExecute.mockResolvedValueOnce(err(smtpError)).mockResolvedValueOnce(ok({}))

      await expect(processor(makeJob())).rejects.toBe(smtpError)

      expect(mockRedisDel).toHaveBeenCalledWith(IDEMPOTENCY_KEY)
      expect(repository.delete).not.toHaveBeenCalled()
      // 'completed' nunca foi gravado
      expect(mockRedisSet).toHaveBeenCalledTimes(1)
    })

    it('falha parcial: loga warn com contagem de sucessos/falhas (Promise.allSettled)', async () => {
      const smtpError = new SmtpDispatchError(new Error('smtp caiu'))
      mockSendEmailExecute.mockResolvedValueOnce(ok({})).mockResolvedValueOnce(err(smtpError))

      await expect(processor(makeJob())).rejects.toBe(smtpError)

      expect(logger.warn).toHaveBeenCalledWith({ successCount: 1, failureCount: 1 }, WORKER_LOGS.PARTIAL_BATCH_FAILURE)
    })

    it('falha total: não loga o warn de falha parcial e não incrementa metric de emails enviados', async () => {
      mockSendEmailExecute.mockResolvedValue(err(new SmtpDispatchError(new Error('smtp caiu'))))

      await expect(processor(makeJob())).rejects.toBeInstanceOf(SmtpDispatchError)

      expect(logger.warn).not.toHaveBeenCalledWith(expect.anything(), WORKER_LOGS.PARTIAL_BATCH_FAILURE)
      expect(mockSentInc).not.toHaveBeenCalled()
    })

    it('falha parcial: persiste apenas os destinatários que falharam no banco e no payload do BullMQ', async () => {
      const smtpError = new SmtpDispatchError(new Error('smtp caiu'))
      // emailUser falha, emailStaff envia
      mockSendEmailExecute.mockResolvedValueOnce(err(smtpError)).mockResolvedValueOnce(ok({}))
      const job = makeJob()

      await expect(processor(job)).rejects.toBe(smtpError)

      expect(repository.updatePendingRecipients).toHaveBeenCalledWith(PUBLIC_ID, [emailUser.to])
      expect(job.updateData).toHaveBeenCalledWith({ ...job.data, emails: [emailUser] })
    })

    it('falha total: não persiste destinatários pendentes (gate de falha parcial)', async () => {
      mockSendEmailExecute.mockResolvedValue(err(new SmtpDispatchError(new Error('smtp caiu'))))
      const job = makeJob()

      await expect(processor(job)).rejects.toBeInstanceOf(SmtpDispatchError)

      expect(repository.updatePendingRecipients).not.toHaveBeenCalled()
      expect(job.updateData).not.toHaveBeenCalled()
    })

    it('falha parcial best-effort: se o banco falhar, loga, NÃO atualiza o BullMQ e ainda relança o erro SMTP', async () => {
      const smtpError = new SmtpDispatchError(new Error('smtp caiu'))
      mockSendEmailExecute.mockResolvedValueOnce(err(smtpError)).mockResolvedValueOnce(ok({}))
      repository.updatePendingRecipients.mockResolvedValueOnce(err(new InfraTestError()))
      const job = makeJob()

      await expect(processor(job)).rejects.toBe(smtpError)

      expect(logger.error).toHaveBeenCalledWith({ publicId: PUBLIC_ID }, WORKER_LOGS.PENDING_RECIPIENTS_UPDATE_FAILED)
      expect(job.updateData).not.toHaveBeenCalled()
    })

    it('falha parcial best-effort: se job.updateData estourar, loga e ainda relança o erro SMTP', async () => {
      const smtpError = new SmtpDispatchError(new Error('smtp caiu'))
      mockSendEmailExecute.mockResolvedValueOnce(err(smtpError)).mockResolvedValueOnce(ok({}))
      const job = makeJob()
      ;(job.updateData as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('redis caiu'))

      await expect(processor(job)).rejects.toBe(smtpError)

      expect(repository.updatePendingRecipients).toHaveBeenCalledWith(PUBLIC_ID, [emailUser.to])
      expect(logger.error).toHaveBeenCalledWith({ publicId: PUBLIC_ID }, WORKER_LOGS.JOB_DATA_UPDATE_FAILED)
    })

    it('mistura de rejeição inesperada e Result err: todos os envios são aguardados antes de relançar', async () => {
      mockSendEmailExecute
        .mockRejectedValueOnce(new Error('estouro inesperado'))
        .mockResolvedValueOnce(err(new SmtpDispatchError(new Error('smtp caiu'))))

      await expect(processor(makeJob())).rejects.toBeInstanceOf(SmtpDispatchError)

      expect(mockSendEmailExecute).toHaveBeenCalledTimes(2)
      expect(mockRedisDel).toHaveBeenCalledWith(IDEMPOTENCY_KEY)
    })

    it('falha total: apaga a chave e relança sem deletar o outbox', async () => {
      const smtpError = new SmtpDispatchError(new Error('smtp caiu'))
      mockSendEmailExecute.mockResolvedValue(err(smtpError))

      await expect(processor(makeJob())).rejects.toBe(smtpError)

      expect(mockRedisDel).toHaveBeenCalledWith(IDEMPOTENCY_KEY)
      expect(repository.delete).not.toHaveBeenCalled()
    })

    it('rejeição inesperada no envio (não-Result): apaga a chave e embrulha em SmtpDispatchError', async () => {
      mockSendEmailExecute.mockRejectedValueOnce(new Error('estouro inesperado'))

      await expect(processor(makeJob())).rejects.toBeInstanceOf(SmtpDispatchError)

      expect(mockRedisDel).toHaveBeenCalledWith(IDEMPOTENCY_KEY)
      expect(repository.delete).not.toHaveBeenCalled()
    })

    it('falha ao gravar completed (Redis fora): apaga a chave, relança e não deleta o outbox (at-least-once)', async () => {
      mockRedisSet
        .mockResolvedValueOnce('OK') // aquisição NX
        .mockRejectedValueOnce(new Error('redis fora')) // gravação do completed

      await expect(processor(makeJob())).rejects.toBeInstanceOf(SmtpDispatchError)

      expect(mockRedisDel).toHaveBeenCalledWith(IDEMPOTENCY_KEY)
      expect(repository.delete).not.toHaveBeenCalled()
    })

    describe('tratamento de rejeição permanente vs transitória SMTP', () => {
      it('erro 5xx do SMTP (ex: 550 Mailbox unavailable): lança UnrecoverableError para abortar retries', async () => {
        const permanentError = Object.assign(new Error('550 Mailbox unavailable'), {
          responseCode: 550,
          response: '550 5.1.1 User unknown',
        })
        mockSendEmailExecute.mockResolvedValueOnce(err(new SmtpDispatchError(permanentError)))

        const job = makeJob({ emails: [emailUser] })
        await expect(processor(job)).rejects.toThrow(UnrecoverableError)
        expect(mockRedisDel).toHaveBeenCalledWith(IDEMPOTENCY_KEY)
      })

      it('erro EENVELOPE do Nodemailer (destinatário inválido): lança UnrecoverableError', async () => {
        const envelopeError = Object.assign(new Error('Recipient rejected'), {
          code: 'EENVELOPE',
          responseCode: 553,
        })
        mockSendEmailExecute.mockResolvedValueOnce(err(new SmtpDispatchError(envelopeError)))

        const job = makeJob({ emails: [emailUser] })
        await expect(processor(job)).rejects.toThrow(UnrecoverableError)
        expect(mockRedisDel).toHaveBeenCalledWith(IDEMPOTENCY_KEY)
      })

      it('erro transitório 4xx (ex: 421 Service not available): lança SmtpDispatchError normal para acionar retry', async () => {
        const transientError = Object.assign(new Error('421 Service not available'), {
          responseCode: 421,
        })
        mockSendEmailExecute.mockResolvedValueOnce(err(new SmtpDispatchError(transientError)))

        const job = makeJob({ emails: [emailUser] })
        const thrownError = await processor(job).catch((e: unknown) => e)
        expect(thrownError).toBeInstanceOf(SmtpDispatchError)
        expect(thrownError).not.toBeInstanceOf(UnrecoverableError)
        expect(mockRedisDel).toHaveBeenCalledWith(IDEMPOTENCY_KEY)
      })

      it('lote misto (1 permanente 550 e 1 transitório 421): lança SmtpDispatchError pois nem todas as falhas são permanentes', async () => {
        const permanentError = Object.assign(new Error('550 User unknown'), { responseCode: 550 })
        const transientError = Object.assign(new Error('421 Service unavailable'), { responseCode: 421 })

        mockSendEmailExecute
          .mockResolvedValueOnce(err(new SmtpDispatchError(permanentError)))
          .mockResolvedValueOnce(err(new SmtpDispatchError(transientError)))

        const job = makeJob()
        const thrownError = await processor(job).catch((e: unknown) => e)
        expect(thrownError).toBeInstanceOf(SmtpDispatchError)
        expect(thrownError).not.toBeInstanceOf(UnrecoverableError)
      })

      it('lote misto (1 transitório 421 e 1 permanente 550): lança SmtpDispatchError', async () => {
        const permanentError = Object.assign(new Error('550 User unknown'), { responseCode: 550 })
        const transientError = Object.assign(new Error('421 Service unavailable'), { responseCode: 421 })

        mockSendEmailExecute
          .mockResolvedValueOnce(err(new SmtpDispatchError(transientError)))
          .mockResolvedValueOnce(err(new SmtpDispatchError(permanentError)))

        const job = makeJob()
        const thrownError = await processor(job).catch((e: unknown) => e)
        expect(thrownError).toBeInstanceOf(SmtpDispatchError)
        expect(thrownError).not.toBeInstanceOf(UnrecoverableError)
      })

      it('erro permanente onde a causa não é instância de Error: converte via String()', async () => {
        const plainObjectError = { responseCode: 550, response: '550 User unknown', toString: () => 'Plain 550 error' }
        mockSendEmailExecute.mockResolvedValueOnce(err(plainObjectError))

        const job = makeJob({ emails: [emailUser] })
        const thrownError = await processor(job).catch((e: unknown) => e)
        expect(thrownError).toBeInstanceOf(UnrecoverableError)
        expect((thrownError as Error).message).toBe('Plain 550 error')
      })

      it('falha parcial com promise rejeitada no execute: persiste apenas os destinatários falhos e relança o erro rejeitado', async () => {
        const networkError = new InfraTestError()
        mockSendEmailExecute.mockResolvedValueOnce(ok({})).mockRejectedValueOnce(networkError)

        const job = makeJob()
        await expect(processor(job)).rejects.toBe(networkError)

        expect(repository.updatePendingRecipients).toHaveBeenCalledWith(PUBLIC_ID, [emailStaff.to])
        expect(job.updateData).toHaveBeenCalledWith({ ...job.data, emails: [emailStaff] })
      })
    })
  })

  describe('fase de limpeza do outbox (regressão do envio duplicado)', () => {
    it('delete falha APÓS completed gravado: relança o erro e NUNCA apaga a chave de idempotência', async () => {
      const infraError = new InfraTestError()
      repository.delete.mockResolvedValueOnce(err(infraError))

      await expect(processor(makeJob())).rejects.toBe(infraError)

      expect(mockSendEmailExecute).toHaveBeenCalledTimes(2)
      expect(mockRedisSet).toHaveBeenNthCalledWith(
        2,
        IDEMPOTENCY_KEY,
        'completed',
        'EX',
        WORKER_CONSTANTS.IDEMPOTENCY_TTL.COMPLETED_SECONDS,
      )
      expect(mockRedisDel).not.toHaveBeenCalled()
    })

    it('retry após falha do delete: cai no branch completed e não reenvia nenhum e-mail (fim-a-fim sem duplicata)', async () => {
      // 1ª execução: envia, grava completed, delete falha
      repository.delete.mockResolvedValueOnce(err(new InfraTestError()))
      await expect(processor(makeJob())).rejects.toBeInstanceOf(InfraTestError)
      expect(mockSendEmailExecute).toHaveBeenCalledTimes(2)

      // 2ª execução (retry do BullMQ): chave persiste como completed
      mockRedisSet.mockResolvedValueOnce(null)
      mockRedisGet.mockResolvedValueOnce('completed')

      await processor(makeJob())

      expect(mockSendEmailExecute).toHaveBeenCalledTimes(2) // nenhuma chamada nova
      expect(repository.delete).toHaveBeenCalledTimes(2)
    })

    it('delete idempotente (linha já removida vira ok no repositório): job completa sem erro', async () => {
      repository.delete.mockResolvedValueOnce(ok(undefined))

      await expect(processor(makeJob())).resolves.toBeUndefined()
    })
  })

  describe('quando métricas são nulas (registry desabilitado)', () => {
    beforeEach(() => {
      metricsState.enabled = false
      mockSendEmailExecute.mockResolvedValue(ok({}))
    })

    afterEach(() => {
      metricsState.enabled = true
    })

    it('processa envio com sucesso sem lançar erro quando métricas são null', async () => {
      await expect(processor(makeJob())).resolves.toBeUndefined()
    })

    it('processa job expirado sem lançar erro quando métricas são null', async () => {
      const expiresAt = new Date(Date.now() - 1000).toISOString()
      await expect(processor(makeJob({ expiresAt }))).resolves.toBeUndefined()
    })

    it('processa job já em processing sem lançar erro de métricas', async () => {
      mockRedisSet.mockResolvedValueOnce(null)
      mockRedisGet.mockResolvedValueOnce('processing')
      await expect(processor(makeJob())).rejects.toBeInstanceOf(JobAlreadyProcessingError)
    })

    it('processa job já enviado (completed) sem lançar erro de métricas', async () => {
      mockRedisSet.mockResolvedValueOnce(null)
      mockRedisGet.mockResolvedValueOnce('completed')
      await expect(processor(makeJob())).resolves.toBeUndefined()
    })

    it('processa falha com erro transitório sem lançar erro de métricas', async () => {
      mockSendEmailExecute.mockResolvedValueOnce(err(new SmtpDispatchError(new Error('transient'))))
      await expect(processor(makeJob({ emails: [emailUser] }))).rejects.toBeInstanceOf(SmtpDispatchError)
    })

    it('processa falha com erro permanente sem lançar erro de métricas', async () => {
      const permanentError = Object.assign(new Error('550 User unknown'), { responseCode: 550 })
      mockSendEmailExecute.mockResolvedValueOnce(err(new SmtpDispatchError(permanentError)))
      await expect(processor(makeJob({ emails: [emailUser] }))).rejects.toThrow(UnrecoverableError)
    })
  })
})

describe('createJobFailureHandler', () => {
  let repository: ReturnType<typeof makeRepository>
  let handleJobFailure: (job: Job<IOutboxDispatchData> | undefined, err: Error) => Promise<void>

  beforeEach(() => {
    vi.clearAllMocks()
    repository = makeRepository()
    handleJobFailure = createJobFailureHandler(repository as unknown as IOutboxRepository)
  })

  it('falha não-definitiva: apenas loga, sem reverter o outbox, sem capturar no Sentry', async () => {
    const smtpError = new Error('smtp caiu')
    await handleJobFailure(makeJob({ attemptsMade: 1 }), smtpError)

    expect(repository.updateStatus).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith({ jobId: 'job-1', err: 'smtp caiu' }, WORKER_LOGS.GENERIC_WORKER_FAILURE)
    expect(mockCaptureError).not.toHaveBeenCalled()
  })

  it('falha definitiva (attemptsMade == attempts): reverte o evento para PENDING e captura no Sentry', async () => {
    const smtpError = new Error('smtp caiu')
    await handleJobFailure(makeJob({ attemptsMade: 3 }), smtpError)

    expect(repository.updateStatus).toHaveBeenCalledWith(PUBLIC_ID, IOutboxEventStatus.PENDING)
    expect(logger.warn).toHaveBeenCalledWith(
      { jobId: 'job-1', publicId: PUBLIC_ID },
      WORKER_LOGS.OUTBOX_REVERTED_AFTER_FINAL_FAILURE,
    )
    expect(mockCaptureError).toHaveBeenCalledWith(smtpError, { jobId: 'job-1', publicId: PUBLIC_ID })
  })

  it('opts.attempts ausente: finalidade calculada contra o padrão 1 (reverte na primeira falha)', async () => {
    await handleJobFailure(makeJob({ attemptsMade: 1, attempts: undefined }), new Error('smtp caiu'))

    expect(repository.updateStatus).toHaveBeenCalledWith(PUBLIC_ID, IOutboxEventStatus.PENDING)
  })

  it('job undefined (evento failed sem job): não lança e não reverte', async () => {
    await expect(handleJobFailure(undefined, new Error('qualquer'))).resolves.toBeUndefined()

    expect(repository.updateStatus).not.toHaveBeenCalled()
    expect(mockCaptureError).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith({ jobId: undefined, err: 'qualquer' }, WORKER_LOGS.GENERIC_WORKER_FAILURE)
  })

  it('job.data sem publicId: não reverte e não lança', async () => {
    const job = {
      id: 'job-1',
      data: {},
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as unknown as Job<IOutboxDispatchData>

    await expect(handleJobFailure(job, new Error('smtp caiu'))).resolves.toBeUndefined()

    expect(repository.updateStatus).not.toHaveBeenCalled()
  })

  it('Missing lock (glitch transitório): warn, nenhuma reversão, sem captura no Sentry', async () => {
    await handleJobFailure(makeJob({ attemptsMade: 3 }), new Error('Missing lock for job job-1'))

    expect(logger.warn).toHaveBeenCalledWith({ jobId: 'job-1' }, WORKER_LOGS.BULLMQ_NETWORK_GLITCH)
    expect(repository.updateStatus).not.toHaveBeenCalled()
    expect(mockCaptureError).not.toHaveBeenCalled()
  })

  it('job stalled transitório: warn e nenhuma reversão', async () => {
    await handleJobFailure(makeJob({ attemptsMade: 1 }), new Error('job stalled'))

    expect(logger.warn).toHaveBeenCalledWith({ jobId: 'job-1' }, WORKER_LOGS.BULLMQ_NETWORK_GLITCH)
    expect(repository.updateStatus).not.toHaveBeenCalled()
  })

  it('job stalled more than allowable limit: tratado como definitivo e reverte para PENDING', async () => {
    await handleJobFailure(makeJob({ attemptsMade: 1 }), new Error('job stalled more than allowable limit'))

    expect(repository.updateStatus).toHaveBeenCalledWith(PUBLIC_ID, IOutboxEventStatus.PENDING)
  })

  it('reversão retorna err (linha possivelmente já deletada): loga em warn sem lançar e captura no Sentry', async () => {
    const revertError = new InfraTestError()
    repository.updateStatus.mockResolvedValueOnce(err(revertError))

    await expect(handleJobFailure(makeJob({ attemptsMade: 3 }), new Error('smtp caiu'))).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      { jobId: 'job-1', publicId: PUBLIC_ID, error: revertError },
      WORKER_LOGS.OUTBOX_REVERT_AFTER_FINAL_FAILURE_ERROR,
    )
    expect(mockCaptureError).toHaveBeenCalledWith(revertError, { jobId: 'job-1', publicId: PUBLIC_ID })
  })

  it('exceção inesperada dentro do handler é engolida, logada e capturada no Sentry (nunca vira unhandledRejection)', async () => {
    const handlerThrown = new Error('estouro inesperado')
    repository.updateStatus.mockRejectedValueOnce(handlerThrown)

    await expect(handleJobFailure(makeJob({ attemptsMade: 3 }), new Error('smtp caiu'))).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith({ jobId: 'job-1', err: handlerThrown }, WORKER_LOGS.FAILURE_HANDLER_ERROR)
    expect(mockCaptureError).toHaveBeenCalledWith(handlerThrown, { jobId: 'job-1' })
  })

  it('erro com formato de infraestrutura (body + statusCode): usa o log de infra e ainda reverte quando definitivo', async () => {
    const infraShaped = Object.assign(new Error('falha de infra'), {
      body: { code: 'INFRA_CODE' },
      statusCode: 500,
      cause: 'root',
    })

    await handleJobFailure(makeJob({ attemptsMade: 3 }), infraShaped)

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INFRA_CODE' }),
      expect.stringContaining('Falha de Infraestrutura'),
    )
    expect(repository.updateStatus).toHaveBeenCalledWith(PUBLIC_ID, IOutboxEventStatus.PENDING)
    expect(mockCaptureError).toHaveBeenCalledWith(infraShaped, { jobId: 'job-1', publicId: PUBLIC_ID })
  })

  it('erro com formato de infraestrutura quando job é undefined: loga com jobId undefined sem lançar TypeError', async () => {
    const infraShaped = Object.assign(new Error('falha de infra'), {
      body: { code: 'INFRA_CODE' },
      statusCode: 500,
      cause: 'root',
    })

    await expect(handleJobFailure(undefined, infraShaped)).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: undefined, code: 'INFRA_CODE' }),
      expect.stringContaining('Falha de Infraestrutura'),
    )
  })

  it('UnrecoverableError é tratado como definitivo mesmo com tentativas restantes (reverte outbox e captura Sentry)', async () => {
    const unrecoverable = new UnrecoverableError('550 Recipient address rejected')

    await handleJobFailure(makeJob({ attemptsMade: 1, attempts: 3 }), unrecoverable)

    expect(repository.updateStatus).toHaveBeenCalledWith(PUBLIC_ID, IOutboxEventStatus.PENDING)
    expect(mockCaptureError).toHaveBeenCalledWith(unrecoverable, { jobId: 'job-1', publicId: PUBLIC_ID })
  })

  it('trata erro duck-typed com name === UnrecoverableError como definitivo', async () => {
    const duckTyped = Object.assign(new Error('fatal error'), { name: 'UnrecoverableError' })
    await handleJobFailure(makeJob({ attemptsMade: 1 }), duckTyped)

    expect(repository.updateStatus).toHaveBeenCalledWith(PUBLIC_ID, IOutboxEventStatus.PENDING)
    expect(mockCaptureError).toHaveBeenCalledWith(duckTyped, { jobId: 'job-1', publicId: PUBLIC_ID })
  })

  it('erro com apenas statusCode ou apenas body: usa log genérico e jobId', async () => {
    const errorOnlyStatus = Object.assign(new Error('status only'), { statusCode: 500 })
    await handleJobFailure(makeJob({ attemptsMade: 1 }), errorOnlyStatus)

    expect(logger.error).toHaveBeenCalledWith(
      { jobId: 'job-1', err: 'status only' },
      WORKER_LOGS.GENERIC_WORKER_FAILURE,
    )

    const errorOnlyBody = Object.assign(new Error('body only'), { body: {} })
    await handleJobFailure(makeJob({ attemptsMade: 1 }), errorOnlyBody)

    expect(logger.error).toHaveBeenCalledWith({ jobId: 'job-1', err: 'body only' }, WORKER_LOGS.GENERIC_WORKER_FAILURE)
  })

  it('falha definitiva loga warn com jobId e publicId corretos', async () => {
    await handleJobFailure(makeJob({ attemptsMade: 3 }), new Error('smtp caiu'))

    expect(logger.warn).toHaveBeenCalledWith(
      { jobId: 'job-1', publicId: PUBLIC_ID },
      WORKER_LOGS.OUTBOX_REVERTED_AFTER_FINAL_FAILURE,
    )
  })
})

describe('startMailWorker', () => {
  it('instancia o Worker com queue mail, lockDuration, stalledInterval e rate limiter distribuído', () => {
    const repository = makeRepository()
    startMailWorker(repository as unknown as IOutboxRepository)

    expect(attachRedisLogger).toHaveBeenCalledWith(expect.anything(), 'MailWorker')
    expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function))
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      QUEUE.NAMES.MAIL,
      expect.any(Function),
      expect.objectContaining({
        concurrency: WORKER_CONSTANTS.MAIL.CONCURRENCY_LIMIT,
        lockDuration: WORKER_CONSTANTS.MAIL.LOCK_DURATION_MS,
        stalledInterval: WORKER_CONSTANTS.MAIL.STALLED_INTERVAL_MS,
        limiter: {
          max: 2,
          duration: 1000,
        },
      }),
    )

    const onFailedCall = mockWorkerOn.mock.calls.find((call) => call[0] === 'failed')
    expect(onFailedCall).toBeDefined()
    if (!onFailedCall) throw new Error('onFailedCall not found')
    const onFailedHandler = onFailedCall[1]
    onFailedHandler(makeJob({ attemptsMade: 1 }), new Error('worker failed'))
    expect(logger.error).toHaveBeenCalledWith(
      { jobId: 'job-1', err: 'worker failed' },
      WORKER_LOGS.GENERIC_WORKER_FAILURE,
    )
  })
})

describe('extractCandidates', () => {
  it('retorna array vazio para primitivos e null', () => {
    expect(extractCandidates(null)).toEqual([])
    expect(extractCandidates(undefined)).toEqual([])
    expect(extractCandidates('some string')).toEqual([])
    expect(extractCandidates(123)).toEqual([])
    expect(extractCandidates(true)).toEqual([])
  })

  it('retorna array com o próprio objeto e causas / originalErrors aninhados', () => {
    const root = { responseCode: 500, cause: { code: 'EENVELOPE' }, originalError: { response: '550' } }
    expect(extractCandidates(root)).toEqual([root, { code: 'EENVELOPE' }, { response: '550' }])
  })
})

describe('isUnrecoverable', () => {
  it('retorna true para instâncias de UnrecoverableError mesmo com name customizado', () => {
    class CustomUnrecoverable extends UnrecoverableError {
      constructor() {
        super('custom')
        this.name = 'CustomUnrecoverable'
      }
    }
    expect(isUnrecoverable(new CustomUnrecoverable())).toBe(true)
  })

  it('retorna false para valores que não são objetos ou são null/undefined', () => {
    expect(isUnrecoverable(null)).toBe(false)
    expect(isUnrecoverable(undefined)).toBe(false)
    expect(isUnrecoverable('UnrecoverableError')).toBe(false)
    expect(isUnrecoverable(123)).toBe(false)
    expect(isUnrecoverable(true)).toBe(false)
  })

  it('retorna true para objetos duck-typed com name === UnrecoverableError', () => {
    expect(isUnrecoverable({ name: 'UnrecoverableError' })).toBe(true)
  })

  it('retorna false para objetos com outro name ou sem name', () => {
    expect(isUnrecoverable({ name: 'OtherError' })).toBe(false)
    expect(isUnrecoverable({})).toBe(false)
    expect(isUnrecoverable(new Error('regular error'))).toBe(false)
  })
})

describe('isPermanentSmtpError', () => {
  it('retorna false para valores que não são objetos (primitivos, null, undefined)', () => {
    expect(isPermanentSmtpError(null)).toBe(false)
    expect(isPermanentSmtpError(undefined)).toBe(false)
    expect(isPermanentSmtpError('string error')).toBe(false)
    expect(isPermanentSmtpError(123)).toBe(false)
    expect(isPermanentSmtpError(true)).toBe(false)
  })

  it('avalia responseCode estritamente no intervalo 5xx [500, 600)', () => {
    expect(isPermanentSmtpError({ responseCode: 499 })).toBe(false)
    expect(isPermanentSmtpError({ responseCode: 500 })).toBe(true)
    expect(isPermanentSmtpError({ responseCode: 550 })).toBe(true)
    expect(isPermanentSmtpError({ responseCode: 599 })).toBe(true)
    expect(isPermanentSmtpError({ responseCode: 600 })).toBe(false)
    expect(isPermanentSmtpError({ responseCode: 601 })).toBe(false)
    expect(isPermanentSmtpError({ responseCode: '550' })).toBe(false)
    expect(isPermanentSmtpError({ responseCode: null })).toBe(false)
    expect(isPermanentSmtpError({ responseCode: NaN })).toBe(false)
  })

  it('avalia code === EENVELOPE', () => {
    expect(isPermanentSmtpError({ code: 'EENVELOPE' })).toBe(true)
    expect(isPermanentSmtpError({ code: 'ECONNRESET' })).toBe(false)
    expect(isPermanentSmtpError({ code: '' })).toBe(false)
    expect(isPermanentSmtpError({ code: undefined })).toBe(false)
  })

  it('avalia response text com regex ^5\\d\\d considerando trim', () => {
    expect(isPermanentSmtpError({ response: '550 5.1.1 User unknown' })).toBe(true)
    expect(isPermanentSmtpError({ response: '  550 Recipient rejected  ' })).toBe(true)
    expect(isPermanentSmtpError({ response: '500 Syntax error' })).toBe(true)
    expect(isPermanentSmtpError({ response: '599 Unknown' })).toBe(true)
    expect(isPermanentSmtpError({ response: '450 Mailbox busy' })).toBe(false)
    expect(isPermanentSmtpError({ response: '250 OK' })).toBe(false)
    expect(isPermanentSmtpError({ response: 'Response: 550 not at start' })).toBe(false)
    expect(isPermanentSmtpError({ response: '5a0 Invalid' })).toBe(false)
    expect(isPermanentSmtpError({ response: 550 })).toBe(false)
    expect(isPermanentSmtpError({ response: null })).toBe(false)
  })

  it('extrai candidatos de err.cause e err.originalError quando são objetos', () => {
    expect(isPermanentSmtpError({ cause: { responseCode: 550 } })).toBe(true)
    expect(isPermanentSmtpError({ cause: { code: 'EENVELOPE' } })).toBe(true)
    expect(isPermanentSmtpError({ cause: { response: '550 User unknown' } })).toBe(true)
    expect(isPermanentSmtpError({ originalError: { responseCode: 550 } })).toBe(true)
    expect(isPermanentSmtpError({ originalError: { code: 'EENVELOPE' } })).toBe(true)
    expect(isPermanentSmtpError({ cause: 'not an object' })).toBe(false)
    expect(isPermanentSmtpError({ originalError: null })).toBe(false)
    expect(isPermanentSmtpError({ cause: 123, originalError: false })).toBe(false)
  })

  it('retorna false quando o objeto não tem nenhum critério permanente', () => {
    expect(isPermanentSmtpError({})).toBe(false)
    expect(isPermanentSmtpError(new Error('generic error'))).toBe(false)
  })
})
