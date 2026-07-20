import { OUTBOX_CONSTANTS, OUTBOX_CONSTANTS as OUTBOX_CFG } from 'messages/constants/outbox/outbox'
import { QUEUE } from 'messages/constants/queue/queue'
import { logger } from '@lib/logger'
import { getMailQueue } from '@lib/queue/mail-queue'
import { DistributedLock, LockToken } from '@lib/infra/distributed-lock/distributed-lock'
import { OutboxDispatchStrategyRegistry } from './outbox-dispatch-strategy-registry'
import { isErr } from 'core/shared/result'
import {
  IOutboxRepository,
  IOutboxEvent,
  IOutboxEventStatus,
} from 'core/contracts/repository/outbox-repository.interface'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'
import { captureError } from '@lib/sentry/capture'

export class OutboxProcessor {
  private readonly LOCK_KEY = OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_PROCESSOR
  private readonly LOCK_TTL_MS = OUTBOX_CONSTANTS.LOCK_TTL_MS.DEFAULT

  constructor(
    private outboxRepository: IOutboxRepository,
    private dispatchRegistry: OutboxDispatchStrategyRegistry,
  ) {}

  async processPendingEvents(): Promise<void> {
    let lockToken: LockToken | null = null

    try {
      lockToken = await DistributedLock.acquire(this.LOCK_KEY, this.LOCK_TTL_MS)
      if (!lockToken) {
        logger.warn(OUTBOX_LOGS.SKIPPED_ANOTHER_RUNNING)
        return
      }

      const pendingEventsResult = await this.outboxRepository.findPending(OUTBOX_CFG.THRESHOLDS.PENDING_FETCH_LIMIT)

      // Verificação do Result
      if (isErr(pendingEventsResult)) {
        logger.error({ error: pendingEventsResult.error }, OUTBOX_LOGS.PENDING_FETCH_ERROR)
        captureError(pendingEventsResult.error)
        return
      }

      const pendingEvents = pendingEventsResult.value

      if (pendingEvents.length === 0) return

      logger.info(`Processando ${pendingEvents.length} eventos pendentes da Outbox...`)

      for (const event of pendingEvents) {
        await DistributedLock.renew(this.LOCK_KEY, lockToken, this.LOCK_TTL_MS)
        await this.processSingleEvent(event)
      }
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.CRITICAL_LOOP_ERROR)
      captureError(error)
    } finally {
      if (lockToken) {
        await DistributedLock.release(this.LOCK_KEY, lockToken)
      }
    }
  }

  async processStuckSendingEvents(): Promise<void> {
    let lockToken: LockToken | null = null

    try {
      lockToken = await DistributedLock.acquire(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY, this.LOCK_TTL_MS)
      if (!lockToken) return

      const thresholdDate = new Date(Date.now() - OUTBOX_CFG.THRESHOLDS.STUCK_SENDING_MS)
      const stuckEventsResult = await this.outboxRepository.findStuck(
        thresholdDate,
        OUTBOX_CFG.THRESHOLDS.STUCK_FETCH_LIMIT,
      )

      // Verificação do Result
      if (isErr(stuckEventsResult)) {
        logger.error({ error: stuckEventsResult.error }, OUTBOX_LOGS.STUCK_FETCH_ERROR)
        captureError(stuckEventsResult.error)
        return
      }

      const stuckEvents = stuckEventsResult.value

      if (stuckEvents.length > 0) {
        logger.warn(`Encontrados ${stuckEvents.length} eventos travados em SENDING. Iniciando recuperação...`)
        for (const event of stuckEvents) {
          await DistributedLock.renew(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY, lockToken, this.LOCK_TTL_MS)
          await this.processSingleEvent(event)
        }
      }
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.CRITICAL_RECOVERY_ERROR)
      captureError(error)
    } finally {
      if (lockToken) {
        await DistributedLock.release(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY, lockToken)
      }
    }
  }

  async processSingleEvent(event: IOutboxEvent): Promise<void> {
    // Gate de expiração — ANTES de qualquer fase: um evento expirado sai da
    // tabela em vez de virar FAILED (o payload carrega um segredo e a linha é
    // lixo em qualquer status). Eventos vindos do Pub/Sub chegam com datas
    // serializadas como string, por isso o new Date().
    if (event.expiresAt && new Date(event.expiresAt).getTime() <= Date.now()) {
      const deleteResult = await this.outboxRepository.delete(event.publicId)

      if (isErr(deleteResult)) {
        logger.error({ publicId: event.publicId, error: deleteResult.error }, OUTBOX_LOGS.EXPIRED_EVENT_DELETE_ERROR)
        captureError(deleteResult.error, { publicId: event.publicId })
      } else {
        logger.info({ publicId: event.publicId, type: event.type }, OUTBOX_LOGS.EXPIRED_EVENT_DELETED)
      }
      return
    }

    // Phase 0: eventos que excederam o limite de ciclos de despacho são terminais (poison message)
    if (event.attempts >= OUTBOX_CFG.THRESHOLDS.MAX_DISPATCH_ATTEMPTS) {
      const failResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventStatus.FAILED)

      if (isErr(failResult)) {
        logger.error({ publicId: event.publicId, error: failResult.error }, OUTBOX_LOGS.FAILED_MARK_ERROR)
        captureError(failResult.error, { publicId: event.publicId })
      } else {
        logger.warn({ publicId: event.publicId, attempts: event.attempts }, OUTBOX_LOGS.MARKED_FAILED)
        // Evento terminal (poison message): sem exceção real para capturar, então
        // sintetizamos uma Error para dar visibilidade no Sentry (política "terminal/critical only").
        captureError(new Error(OUTBOX_LOGS.MARKED_FAILED), { publicId: event.publicId, attempts: event.attempts })
      }
      return
    }

    // Phase 1: Transition to SENDING
    const updateResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventStatus.SENDING)

    if (isErr(updateResult)) {
      logger.error({ publicId: event.publicId, error: updateResult.error }, OUTBOX_LOGS.STATUS_UPDATE_FAILED)
      return
    }

    // Phase 2: Dispatch to BullMQ (revert on failure)
    try {
      await this.dispatchToBullMQ(event)
    } catch (error) {
      const revertResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventStatus.PENDING)

      if (isErr(revertResult)) {
        logger.error({ publicId: event.publicId, error: revertResult.error }, OUTBOX_LOGS.REVERT_FATAL)
        captureError(revertResult.error, { publicId: event.publicId })
      } else {
        logger.error({ publicId: event.publicId, error }, OUTBOX_LOGS.DISPATCH_REVERTED)
      }
    }
  }

  private async dispatchToBullMQ(event: IOutboxEvent): Promise<void> {
    const strategyResult = this.dispatchRegistry.resolve(event.type)
    if (isErr(strategyResult)) {
      throw strategyResult.error
    }

    const planResult = strategyResult.value.buildDispatch(event)
    if (isErr(planResult)) {
      throw planResult.error
    }

    const { emails, jobOptions } = planResult.value

    await getMailQueue().add(
      QUEUE.JOBS.OUTBOX_DISPATCH,
      {
        publicId: event.publicId,
        emails,
        // Repassa a expiração para o gate do mail worker (job data é JSON)
        ...(event.expiresAt ? { expiresAt: new Date(event.expiresAt).toISOString() } : {}),
      },
      { jobId: event.publicId, ...jobOptions },
    )
  }
}
