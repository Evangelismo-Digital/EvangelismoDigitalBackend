import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/logger', () => {
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

vi.mock('@lib/redis/clients/clients', () => ({
  getRedisCache: () => ({ set: mockRedisSet, get: mockRedisGet, del: mockRedisDel }),
  createWorkerConnection: () => ({}),
}))

vi.mock('@lib/redis/connections/redis-bullMQ-connection', () => ({
  attachRedisLogger: vi.fn(),
}))

const mockSendEmailExecute = vi.fn()

vi.mock('@use-cases/factories/make-send-email-use-case', () => ({
  makeSendEmailUseCase: () => ({ execute: mockSendEmailExecute }),
}))

const mockCaptureError = vi.fn()

vi.mock('@lib/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

import { Job } from 'bullmq'
import { createMailJobProcessor, createJobFailureHandler } from './mail-worker'
import { IOutboxRepository, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { IOutboxDispatchData } from 'core/contracts/lib/infra/outbox-dispatch-data.interface'
import { ok, err } from 'core/shared/result'
import { SmtpDispatchError } from '@lib/errors/queue/smtp-dispatch-error'
import { JobAlreadyProcessingError } from '@lib/errors/queue/job-already-processing-error'
import { InfrastructureError } from 'errors/infrastructure-error'
import { logger } from '@lib/logger'
import { WORKER_LOGS } from 'messages/constants/logs/worker'
import { REDIS_CONSTANTS } from 'messages/constants/redis/redis'
import { WORKER_CONSTANTS } from 'messages/constants/workers/workers'

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
  } as unknown as Job<IOutboxDispatchData>
}

function makeRepository() {
  return {
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    updateStatus: vi.fn().mockResolvedValue(ok(undefined)),
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

    it('falha total: não loga o warn de falha parcial', async () => {
      mockSendEmailExecute.mockResolvedValue(err(new SmtpDispatchError(new Error('smtp caiu'))))

      await expect(processor(makeJob())).rejects.toBeInstanceOf(SmtpDispatchError)

      expect(logger.warn).not.toHaveBeenCalledWith(expect.anything(), WORKER_LOGS.PARTIAL_BATCH_FAILURE)
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
    expect(logger.error).toHaveBeenCalledWith(expect.anything(), WORKER_LOGS.GENERIC_WORKER_FAILURE)
    expect(mockCaptureError).not.toHaveBeenCalled()
  })

  it('falha definitiva (attemptsMade == attempts): reverte o evento para PENDING e captura no Sentry', async () => {
    const smtpError = new Error('smtp caiu')
    await handleJobFailure(makeJob({ attemptsMade: 3 }), smtpError)

    expect(repository.updateStatus).toHaveBeenCalledWith(PUBLIC_ID, IOutboxEventStatus.PENDING)
    expect(logger.warn).toHaveBeenCalledWith(expect.anything(), WORKER_LOGS.OUTBOX_REVERTED_AFTER_FINAL_FAILURE)
    expect(mockCaptureError).toHaveBeenCalledWith(smtpError, { jobId: 'job-1', publicId: PUBLIC_ID })
  })

  it('opts.attempts ausente: finalidade calculada contra o padrão 1 (reverte na primeira falha)', async () => {
    await handleJobFailure(makeJob({ attemptsMade: 1, attempts: undefined }), new Error('smtp caiu'))

    expect(repository.updateStatus).toHaveBeenCalledWith(PUBLIC_ID, IOutboxEventStatus.PENDING)
  })

  it('job undefined (evento failed sem job): não lança e não reverte', async () => {
    await expect(handleJobFailure(undefined, new Error('qualquer'))).resolves.toBeUndefined()

    expect(repository.updateStatus).not.toHaveBeenCalled()
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

    expect(logger.warn).toHaveBeenCalledWith(expect.anything(), WORKER_LOGS.BULLMQ_NETWORK_GLITCH)
    expect(repository.updateStatus).not.toHaveBeenCalled()
    expect(mockCaptureError).not.toHaveBeenCalled()
  })

  it('job stalled transitório: warn e nenhuma reversão', async () => {
    await handleJobFailure(makeJob({ attemptsMade: 1 }), new Error('job stalled'))

    expect(logger.warn).toHaveBeenCalledWith(expect.anything(), WORKER_LOGS.BULLMQ_NETWORK_GLITCH)
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

    expect(logger.warn).toHaveBeenCalledWith(expect.anything(), WORKER_LOGS.OUTBOX_REVERT_AFTER_FINAL_FAILURE_ERROR)
    expect(mockCaptureError).toHaveBeenCalledWith(revertError, { jobId: 'job-1', publicId: PUBLIC_ID })
  })

  it('exceção inesperada dentro do handler é engolida, logada e capturada no Sentry (nunca vira unhandledRejection)', async () => {
    repository.updateStatus.mockRejectedValueOnce(new Error('estouro inesperado'))

    await expect(handleJobFailure(makeJob({ attemptsMade: 3 }), new Error('smtp caiu'))).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(expect.anything(), WORKER_LOGS.FAILURE_HANDLER_ERROR)
    expect(mockCaptureError).toHaveBeenCalledWith(expect.any(Error), { jobId: 'job-1' })
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
})
