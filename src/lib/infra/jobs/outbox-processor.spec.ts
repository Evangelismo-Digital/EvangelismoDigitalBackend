import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@env/index', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    DATABASE_URL: 'http://localhost',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    APP_NAME: 'Test',
    APP_PORT: 3000,
    JWT_SECRET: 'x'.repeat(60),
    FRONTEND_URL: 'http://localhost:5173',
    HASH_SALT_ROUNDS: 12,
    SMTP_EMAIL: 'test@example.com',
    SMTP_PASSWORD: 'test',
    SMTP_PORT: 465,
    SMTP_HOST: 'smtp.test.com',
    SMTP_SECURE: true,
    ADMIN_EMAIL: 'admin@example.com',
    SENTRY_DSN: '',
  },
}))

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

const mockAcquire = vi.fn()
const mockRenew = vi.fn()
const mockRelease = vi.fn()

vi.mock('@lib/infra/distributed-lock/distributed-lock', () => ({
  DistributedLock: {
    acquire: (...args: unknown[]) => mockAcquire(...args),
    renew: (...args: unknown[]) => mockRenew(...args),
    release: (...args: unknown[]) => mockRelease(...args),
  },
}))

const mockQueueAdd = vi.fn()

vi.mock('@lib/queue/mail-queue', () => ({
  getMailQueue: () => ({ add: mockQueueAdd }),
}))

const mockCaptureError = vi.fn()

vi.mock('@lib/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

import { OutboxProcessor } from './outbox-processor'
import { makeOutboxDispatchStrategyRegistry } from './make-outbox-dispatch-registry'
import { InMemoryOutboxRepository } from '@repositories/in-memory/in-memory-outbox-repository'
import { IOutboxEvent, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { isOk, err } from 'core/shared/result'
import { OUTBOX_CONSTANTS } from 'messages/constants/outbox/outbox'
import { PASSWORD_RESET_CONSTANTS } from 'messages/constants/auth/password-reset'
import { ContactEmailStrategy } from '@use-cases/forms/strategies/contact-email-strategy'
import { DecisionForChristEmailStrategy } from '@use-cases/forms/strategies/decision-for-christ-email-strategy'
import { InfrastructureError } from 'errors/infrastructure-error'
import { logger } from '@lib/logger'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'

class StrategyTestError extends InfrastructureError {
  constructor() {
    super({ code: 'STRATEGY_TEST_ERROR', message: 'falha de estratégia injetada' })
  }
}

async function createEvent(
  repository: InMemoryOutboxRepository,
  overrides?: { decisaoPorCristo?: boolean; attempts?: number },
): Promise<IOutboxEvent> {
  const created = await repository.create({
    status: IOutboxEventStatus.PENDING,
    type: 'FormSubmissionCreated',
    payload: {
      name: 'João',
      lastName: 'Silva',
      email: 'joao@test.com',
      decisaoPorCristo: overrides?.decisaoPorCristo ?? false,
    },
  })
  if (!isOk(created)) throw new Error('setup: falha ao criar evento')

  if (overrides?.attempts !== undefined) {
    const item = repository.items.find((e) => e.publicId === created.value.publicId)!
    item.attempts = overrides.attempts
  }

  return repository.items.find((e) => e.publicId === created.value.publicId)!
}

async function createPasswordResetEvent(repository: InMemoryOutboxRepository, expiresAt: Date): Promise<IOutboxEvent> {
  const created = await repository.create({
    status: IOutboxEventStatus.PENDING,
    type: 'PasswordResetRequested',
    payload: {
      userPublicId: 'user-1',
      name: 'João',
      email: 'joao@test.com',
      token: 'token-cru-abc123',
      tokenExpiresAt: expiresAt.toISOString(),
    },
    expiresAt,
  })
  if (!isOk(created)) throw new Error('setup: falha ao criar evento de reset')

  return repository.items.find((e) => e.publicId === created.value.publicId)!
}

describe('OutboxProcessor', () => {
  let repository: InMemoryOutboxRepository
  let processor: OutboxProcessor

  beforeEach(() => {
    vi.clearAllMocks()
    repository = new InMemoryOutboxRepository()
    processor = new OutboxProcessor(repository, makeOutboxDispatchStrategyRegistry())

    mockAcquire.mockResolvedValue('lock-token')
    mockRenew.mockResolvedValue(true)
    mockRelease.mockResolvedValue(true)
    mockQueueAdd.mockResolvedValue({})
  })

  describe('processSingleEvent', () => {
    it('caminho feliz: transiciona para SENDING, incrementa attempts e enfileira um job com jobId = publicId', async () => {
      const event = await createEvent(repository)

      await processor.processSingleEvent(event)

      expect(repository.items[0].status).toBe(IOutboxEventStatus.SENDING)
      expect(repository.items[0].attempts).toBe(1)
      expect(mockQueueAdd).toHaveBeenCalledOnce()

      const [, dispatchData, opts] = mockQueueAdd.mock.calls[0]
      expect(dispatchData.publicId).toBe(event.publicId)
      expect(dispatchData.emails).toHaveLength(2)
      expect('expiresAt' in dispatchData).toBe(false)
      expect(opts).toEqual({ jobId: event.publicId })
    })

    it('roteia payload com decisaoPorCristo para DecisionForChristEmailStrategy', async () => {
      const decisionSpy = vi.spyOn(DecisionForChristEmailStrategy.prototype, 'buildUserEmail')
      const event = await createEvent(repository, { decisaoPorCristo: true })

      await processor.processSingleEvent(event)

      expect(decisionSpy).toHaveBeenCalledOnce()
    })

    it('roteia payload sem decisaoPorCristo para ContactEmailStrategy', async () => {
      const contactSpy = vi.spyOn(ContactEmailStrategy.prototype, 'buildUserEmail')
      const event = await createEvent(repository)

      await processor.processSingleEvent(event)

      expect(contactSpy).toHaveBeenCalledOnce()
    })

    it('falha ao transicionar para SENDING: evento permanece PENDING, nada é enfileirado, sem captura no Sentry (retryable)', async () => {
      const event = await createEvent(repository)
      repository.shouldFailOn.updateStatus = true

      await processor.processSingleEvent(event)

      expect(repository.items[0].status).toBe(IOutboxEventStatus.PENDING)
      expect(mockQueueAdd).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.STATUS_UPDATE_FAILED)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('falha no queue.add: reverte para PENDING, limpa sendingAt, sem captura no Sentry (retryable)', async () => {
      const event = await createEvent(repository)
      mockQueueAdd.mockRejectedValueOnce(new Error('redis indisponível'))

      await processor.processSingleEvent(event)

      expect(repository.items[0].status).toBe(IOutboxEventStatus.PENDING)
      expect(repository.items[0].sendingAt).toBeUndefined()
      expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.DISPATCH_REVERTED)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('falha no buildUserEmail: reverte para PENDING sem enfileirar', async () => {
      vi.spyOn(ContactEmailStrategy.prototype, 'buildUserEmail').mockReturnValueOnce(err(new StrategyTestError()))
      const event = await createEvent(repository)

      await processor.processSingleEvent(event)

      expect(repository.items[0].status).toBe(IOutboxEventStatus.PENDING)
      expect(mockQueueAdd).not.toHaveBeenCalled()
    })

    it('falha no buildStaffEmail: reverte para PENDING sem enfileirar', async () => {
      vi.spyOn(ContactEmailStrategy.prototype, 'buildStaffEmail').mockReturnValueOnce(err(new StrategyTestError()))
      const event = await createEvent(repository)

      await processor.processSingleEvent(event)

      expect(repository.items[0].status).toBe(IOutboxEventStatus.PENDING)
      expect(mockQueueAdd).not.toHaveBeenCalled()
    })

    it('falha no dispatch E na reversão: loga REVERT_FATAL sem lançar e captura no Sentry (linha fica SENDING para a recuperação)', async () => {
      const event = await createEvent(repository)
      mockQueueAdd.mockRejectedValueOnce(new Error('redis indisponível'))

      const revertError = new StrategyTestError()
      const originalUpdateStatus = repository.updateStatus.bind(repository)
      const updateStatusSpy = vi.spyOn(repository, 'updateStatus')
      updateStatusSpy.mockImplementation(async (publicId, status) => {
        if (status === IOutboxEventStatus.PENDING) {
          return err(revertError)
        }
        return originalUpdateStatus(publicId, status)
      })

      await expect(processor.processSingleEvent(event)).resolves.toBeUndefined()

      expect(repository.items[0].status).toBe(IOutboxEventStatus.SENDING)
      expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.REVERT_FATAL)
      expect(mockCaptureError).toHaveBeenCalledWith(revertError, { publicId: event.publicId })
    })

    describe('gate de expiração', () => {
      it('evento expirado: deleta a linha sem transicionar status nem enfileirar', async () => {
        const event = await createPasswordResetEvent(repository, new Date(Date.now() - 1000))
        const updateStatusSpy = vi.spyOn(repository, 'updateStatus')

        await processor.processSingleEvent(event)

        expect(repository.items).toHaveLength(0)
        expect(updateStatusSpy).not.toHaveBeenCalled()
        expect(mockQueueAdd).not.toHaveBeenCalled()
        expect(logger.info).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.EXPIRED_EVENT_DELETED)
      })

      it('evento expirado vindo do Pub/Sub (expiresAt serializado como string): mesmo comportamento', async () => {
        const event = await createPasswordResetEvent(repository, new Date(Date.now() - 1000))
        // Simula a serialização JSON do OutboxSignal: datas viram strings ISO
        const serialized = JSON.parse(JSON.stringify(event)) as IOutboxEvent

        await processor.processSingleEvent(serialized)

        expect(repository.items).toHaveLength(0)
        expect(mockQueueAdd).not.toHaveBeenCalled()
      })

      it('falha ao deletar evento expirado: loga, captura no Sentry e não despacha', async () => {
        const event = await createPasswordResetEvent(repository, new Date(Date.now() - 1000))
        repository.shouldFailOn.delete = true

        await expect(processor.processSingleEvent(event)).resolves.toBeUndefined()

        expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.EXPIRED_EVENT_DELETE_ERROR)
        expect(mockCaptureError).toHaveBeenCalledWith(expect.anything(), { publicId: event.publicId })
        expect(mockQueueAdd).not.toHaveBeenCalled()
        expect(repository.items[0].status).toBe(IOutboxEventStatus.PENDING)
      })

      it('evento com expiresAt futuro: despacha normalmente com expiresAt ISO no job data', async () => {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
        const event = await createPasswordResetEvent(repository, expiresAt)

        await processor.processSingleEvent(event)

        expect(mockQueueAdd).toHaveBeenCalledOnce()
        const [, dispatchData] = mockQueueAdd.mock.calls[0]
        expect(dispatchData.expiresAt).toBe(expiresAt.toISOString())
      })
    })

    describe('roteamento por tipo via registry', () => {
      it('PasswordResetRequested: enfileira um único e-mail com jobOptions de backoff fixo', async () => {
        const event = await createPasswordResetEvent(repository, new Date(Date.now() + 15 * 60 * 1000))

        await processor.processSingleEvent(event)

        expect(repository.items[0].status).toBe(IOutboxEventStatus.SENDING)
        expect(mockQueueAdd).toHaveBeenCalledOnce()

        const [, dispatchData, opts] = mockQueueAdd.mock.calls[0]
        expect(dispatchData.emails).toHaveLength(1)
        expect(dispatchData.emails[0].to).toBe('joao@test.com')
        expect(opts).toEqual({
          jobId: event.publicId,
          attempts: PASSWORD_RESET_CONSTANTS.JOB_ATTEMPTS,
          backoff: { type: 'fixed', delay: PASSWORD_RESET_CONSTANTS.JOB_BACKOFF_DELAY_MS },
        })
      })

      it('tipo de evento desconhecido: reverte para PENDING sem enfileirar (caminho poison message)', async () => {
        const event = await createEvent(repository)
        repository.items[0].type = 'TipoInexistente'
        event.type = 'TipoInexistente'

        await processor.processSingleEvent(event)

        expect(repository.items[0].status).toBe(IOutboxEventStatus.PENDING)
        expect(mockQueueAdd).not.toHaveBeenCalled()
        expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.DISPATCH_REVERTED)
      })
    })

    describe('limite de tentativas de despacho (poison message)', () => {
      it('attempts = MAX - 1: processa normalmente', async () => {
        const event = await createEvent(repository, {
          attempts: OUTBOX_CONSTANTS.THRESHOLDS.MAX_DISPATCH_ATTEMPTS - 1,
        })

        await processor.processSingleEvent(event)

        expect(repository.items[0].status).toBe(IOutboxEventStatus.SENDING)
        expect(mockQueueAdd).toHaveBeenCalledOnce()
      })

      it('attempts = MAX: marca FAILED sem enfileirar e captura no Sentry (poison message)', async () => {
        const event = await createEvent(repository, {
          attempts: OUTBOX_CONSTANTS.THRESHOLDS.MAX_DISPATCH_ATTEMPTS,
        })

        await processor.processSingleEvent(event)

        expect(repository.items[0].status).toBe(IOutboxEventStatus.FAILED)
        expect(mockQueueAdd).not.toHaveBeenCalled()
        expect(logger.warn).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.MARKED_FAILED)
        expect(mockCaptureError).toHaveBeenCalledWith(expect.any(Error), {
          publicId: event.publicId,
          attempts: event.attempts,
        })
      })

      it('attempts > MAX: marca FAILED sem enfileirar', async () => {
        const event = await createEvent(repository, {
          attempts: OUTBOX_CONSTANTS.THRESHOLDS.MAX_DISPATCH_ATTEMPTS + 1,
        })

        await processor.processSingleEvent(event)

        expect(repository.items[0].status).toBe(IOutboxEventStatus.FAILED)
        expect(mockQueueAdd).not.toHaveBeenCalled()
      })

      it('marca FAILED preserva a linha (estado terminal, não deleta)', async () => {
        const event = await createEvent(repository, {
          attempts: OUTBOX_CONSTANTS.THRESHOLDS.MAX_DISPATCH_ATTEMPTS,
        })

        await processor.processSingleEvent(event)

        expect(repository.items).toHaveLength(1)
      })

      it('falha ao marcar FAILED: loga FAILED_MARK_ERROR sem lançar e captura no Sentry', async () => {
        const event = await createEvent(repository, {
          attempts: OUTBOX_CONSTANTS.THRESHOLDS.MAX_DISPATCH_ATTEMPTS,
        })
        repository.shouldFailOn.updateStatus = true

        await expect(processor.processSingleEvent(event)).resolves.toBeUndefined()

        expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.FAILED_MARK_ERROR)
        expect(mockQueueAdd).not.toHaveBeenCalled()
        expect(mockCaptureError).toHaveBeenCalledWith(expect.anything(), { publicId: event.publicId })
      })
    })
  })

  describe('processPendingEvents', () => {
    it('lock não adquirido: retorna sem consultar eventos', async () => {
      const findPendingSpy = vi.spyOn(repository, 'findPending')
      mockAcquire.mockResolvedValueOnce(null)

      await processor.processPendingEvents()

      expect(findPendingSpy).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(OUTBOX_LOGS.SKIPPED_ANOTHER_RUNNING)
      expect(mockRelease).not.toHaveBeenCalled()
    })

    it('falha ao buscar pendentes: loga, captura no Sentry e libera o lock', async () => {
      repository.shouldFailOn.findPending = true

      await processor.processPendingEvents()

      expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.PENDING_FETCH_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(expect.anything())
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('lista vazia: retorna cedo sem enfileirar e libera o lock', async () => {
      await processor.processPendingEvents()

      expect(mockQueueAdd).not.toHaveBeenCalled()
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('N eventos pendentes: processa todos, renova o lock por evento e libera ao final', async () => {
      await createEvent(repository)
      await createEvent(repository)
      await createEvent(repository)

      await processor.processPendingEvents()

      expect(mockQueueAdd).toHaveBeenCalledTimes(3)
      expect(mockRenew).toHaveBeenCalledTimes(3)
      expect(mockRelease).toHaveBeenCalledOnce()
      expect(repository.items.every((e) => e.status === IOutboxEventStatus.SENDING)).toBe(true)
    })

    it('falha de dispatch em um evento não impede o processamento dos demais', async () => {
      await createEvent(repository)
      await createEvent(repository)
      mockQueueAdd.mockRejectedValueOnce(new Error('falha pontual'))

      await processor.processPendingEvents()

      expect(mockQueueAdd).toHaveBeenCalledTimes(2)
      expect(repository.items[0].status).toBe(IOutboxEventStatus.PENDING)
      expect(repository.items[1].status).toBe(IOutboxEventStatus.SENDING)
    })

    it('erro inesperado no loop (renew rejeita): loga erro crítico, captura no Sentry e ainda libera o lock', async () => {
      await createEvent(repository)
      mockRenew.mockRejectedValueOnce(new Error('conexão perdida'))

      await processor.processPendingEvents()

      expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.CRITICAL_LOOP_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(expect.anything())
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })

  describe('processStuckSendingEvents', () => {
    async function createStuckEvent(overrides?: { attempts?: number }): Promise<IOutboxEvent> {
      const event = await createEvent(repository)
      await repository.updateStatus(event.publicId, IOutboxEventStatus.SENDING)
      const item = repository.items.find((e) => e.publicId === event.publicId)!
      item.sendingAt = new Date(Date.now() - 2 * OUTBOX_CONSTANTS.THRESHOLDS.STUCK_SENDING_MS)
      if (overrides?.attempts !== undefined) {
        item.attempts = overrides.attempts
      }
      return item
    }

    it('lock não adquirido: retorna sem consultar eventos travados', async () => {
      const findStuckSpy = vi.spyOn(repository, 'findStuck')
      mockAcquire.mockResolvedValueOnce(null)

      await processor.processStuckSendingEvents()

      expect(findStuckSpy).not.toHaveBeenCalled()
    })

    it('usa o corte de STUCK_SENDING_MS (15 min) e o limite STUCK_FETCH_LIMIT', async () => {
      const findStuckSpy = vi.spyOn(repository, 'findStuck')
      const before = Date.now()

      await processor.processStuckSendingEvents()

      expect(findStuckSpy).toHaveBeenCalledOnce()
      const [threshold, limit] = findStuckSpy.mock.calls[0]
      const expected = before - OUTBOX_CONSTANTS.THRESHOLDS.STUCK_SENDING_MS
      expect(Math.abs(threshold.getTime() - expected)).toBeLessThan(5_000)
      expect(limit).toBe(OUTBOX_CONSTANTS.THRESHOLDS.STUCK_FETCH_LIMIT)
    })

    it('falha ao buscar travados: loga, captura no Sentry e libera o lock', async () => {
      repository.shouldFailOn.findStuck = true

      await processor.processStuckSendingEvents()

      expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.STUCK_FETCH_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(expect.anything())
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('erro inesperado no loop de recuperação (renew rejeita): loga CRITICAL_RECOVERY_ERROR, captura no Sentry e ainda libera o lock', async () => {
      const stuck = await createEvent(repository)
      await repository.updateStatus(stuck.publicId, IOutboxEventStatus.SENDING)
      repository.items[0].sendingAt = new Date(Date.now() - 2 * OUTBOX_CONSTANTS.THRESHOLDS.STUCK_SENDING_MS)
      mockRenew.mockRejectedValueOnce(new Error('conexão perdida'))

      await processor.processStuckSendingEvents()

      expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.CRITICAL_RECOVERY_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(expect.anything())
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('nenhum evento travado: não processa nada', async () => {
      await processor.processStuckSendingEvents()

      expect(mockQueueAdd).not.toHaveBeenCalled()
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('re-despacha evento travado, incrementando attempts em cada ciclo de recuperação', async () => {
      const stuck = await createStuckEvent()
      const attemptsBefore = stuck.attempts

      await processor.processStuckSendingEvents()

      expect(mockQueueAdd).toHaveBeenCalledOnce()
      expect(repository.items[0].attempts).toBe(attemptsBefore + 1)
      expect(repository.items[0].status).toBe(IOutboxEventStatus.SENDING)
    })

    it('evento travado que atingiu o limite vira FAILED em vez de ser re-despachado (regressão poison loop)', async () => {
      await createStuckEvent({ attempts: OUTBOX_CONSTANTS.THRESHOLDS.MAX_DISPATCH_ATTEMPTS })

      await processor.processStuckSendingEvents()

      expect(mockQueueAdd).not.toHaveBeenCalled()
      expect(repository.items[0].status).toBe(IOutboxEventStatus.FAILED)
    })

    it('libera o lock mesmo quando o processamento de um evento travado falha', async () => {
      await createStuckEvent()
      mockQueueAdd.mockRejectedValueOnce(new Error('falha pontual'))

      await processor.processStuckSendingEvents()

      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })
})
