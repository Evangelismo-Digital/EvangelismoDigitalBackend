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
import {
  collectMetricsOutboxEventsDispatched,
  collectMetricsOutboxEventsReverted,
  collectMetricsOutboxEventsRevertFailed,
  collectMetricsOutboxEventsMarkedAsTerminalFail,
  collectMetricsOutboxEventsExpired,
  collectMetricsOutboxEventsStuckSendingEventsRecovered,
} from '@lib/metrics/outbox-metrics'

export class OutboxProcessor {
  private readonly LOCK_KEY = OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_PROCESSOR
  private readonly LOCK_TTL_MS = OUTBOX_CONSTANTS.LOCK_TTL_MS.DEFAULT

  constructor(
    private outboxRepository: IOutboxRepository,
    private dispatchRegistry: OutboxDispatchStrategyRegistry,
  ) {}

  async processPendingEvents(): Promise<void> {
    await this.withLock(
      this.LOCK_KEY,
      OUTBOX_LOGS.CRITICAL_LOOP_ERROR,
      OUTBOX_LOGS.SKIPPED_ANOTHER_RUNNING,
      async (renew) => {
        const pendingEventsResult = await this.outboxRepository.findPending(OUTBOX_CFG.THRESHOLDS.PENDING_FETCH_LIMIT)

        if (isErr(pendingEventsResult)) {
          logger.error({ error: pendingEventsResult.error }, OUTBOX_LOGS.PENDING_FETCH_ERROR)
          captureError(pendingEventsResult.error)
          return
        }

        const pendingEvents = pendingEventsResult.value

        if (pendingEvents.length === 0) return

        logger.info(`Processando ${pendingEvents.length} eventos pendentes da Outbox...`)

        for (const event of pendingEvents) {
          await renew()
          await this.processSingleEvent(event)
        }
      },
    )
  }

  async processStuckSendingEvents(): Promise<void> {
    await this.withLock(
      OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY,
      OUTBOX_LOGS.CRITICAL_RECOVERY_ERROR,
      null,
      async (renew) => {
        const thresholdDate = new Date(Date.now() - OUTBOX_CFG.THRESHOLDS.STUCK_SENDING_MS)
        const stuckEventsResult = await this.outboxRepository.findStuck(
          thresholdDate,
          OUTBOX_CFG.THRESHOLDS.STUCK_FETCH_LIMIT,
        )

        if (isErr(stuckEventsResult)) {
          logger.error({ error: stuckEventsResult.error }, OUTBOX_LOGS.STUCK_FETCH_ERROR)
          captureError(stuckEventsResult.error)
          return
        }

        const stuckEvents = stuckEventsResult.value

        if (stuckEvents.length === 0) return

        logger.warn(`Encontrados ${stuckEvents.length} eventos travados em SENDING. Iniciando recuperação...`)

        for (const event of stuckEvents) {
          await renew()
          collectMetricsOutboxEventsStuckSendingEventsRecovered?.inc()
          await this.processSingleEvent(event)
        }
      },
    )
  }

  /**
   * Roda `run` sob o lock distribuído, renovando-o entre eventos para que um
   * lote longo não perca a exclusividade no meio do caminho. Se outra instância
   * já detém o lock, nada roda — e `skippedMessage`, quando informado, registra
   * a desistência.
   */
  private async withLock(
    lockKey: string,
    errorMessage: string,
    skippedMessage: string | null,
    run: (renew: () => Promise<void>) => Promise<void>,
  ): Promise<void> {
    let lockToken: LockToken | null = null

    try {
      lockToken = await DistributedLock.acquire(lockKey, this.LOCK_TTL_MS)

      if (!lockToken) {
        if (skippedMessage) logger.warn(skippedMessage)
        return
      }

      const token = lockToken

      await run(async () => {
        await DistributedLock.renew(lockKey, token, this.LOCK_TTL_MS)
      })
    } catch (error) {
      logger.error({ error }, errorMessage)
      captureError(error)
    } finally {
      if (lockToken) {
        await DistributedLock.release(lockKey, lockToken)
      }
    }
  }

  async processSingleEvent(event: IOutboxEvent): Promise<void> {
    if (isExpired(event)) {
      await this.discardExpired(event)
      return
    }

    if (event.attempts >= OUTBOX_CFG.THRESHOLDS.MAX_DISPATCH_ATTEMPTS) {
      await this.markPoisoned(event)
      return
    }

    // Phase 1: Transition to SENDING
    const updateResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventStatus.SENDING)

    if (isErr(updateResult)) {
      logger.error({ publicId: event.publicId, error: updateResult.error }, OUTBOX_LOGS.STATUS_UPDATE_FAILED)
      return
    }

    await this.dispatchOrRevert(event)
  }

  /**
   * Gate de expiração — ANTES de qualquer fase: um evento expirado sai da tabela
   * em vez de virar FAILED. O payload carrega um segredo e a linha é lixo em
   * qualquer status.
   */
  private async discardExpired(event: IOutboxEvent): Promise<void> {
    const deleteResult = await this.outboxRepository.delete(event.publicId)

    if (isErr(deleteResult)) {
      logger.error({ publicId: event.publicId, error: deleteResult.error }, OUTBOX_LOGS.EXPIRED_EVENT_DELETE_ERROR)
      captureError(deleteResult.error, { publicId: event.publicId })
      return
    }

    collectMetricsOutboxEventsExpired?.inc()
    logger.info({ publicId: event.publicId, type: event.type }, OUTBOX_LOGS.EXPIRED_EVENT_DELETED)
  }

  /** Phase 0: excedeu o limite de ciclos de despacho — terminal (poison message). */
  private async markPoisoned(event: IOutboxEvent): Promise<void> {
    const failResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventStatus.FAILED)

    if (isErr(failResult)) {
      logger.error({ publicId: event.publicId, error: failResult.error }, OUTBOX_LOGS.FAILED_MARK_ERROR)
      captureError(failResult.error, { publicId: event.publicId })
      return
    }

    collectMetricsOutboxEventsMarkedAsTerminalFail?.inc()
    logger.warn({ publicId: event.publicId, attempts: event.attempts }, OUTBOX_LOGS.MARKED_FAILED)
    // Evento terminal: sem exceção real para capturar, então sintetizamos uma
    // Error para dar visibilidade no Sentry (política "terminal/critical only").
    captureError(new Error(OUTBOX_LOGS.MARKED_FAILED), { publicId: event.publicId, attempts: event.attempts })
  }

  /** Phase 2: despacha ao BullMQ, revertendo para PENDING se o despacho falhar. */
  private async dispatchOrRevert(event: IOutboxEvent): Promise<void> {
    try {
      await this.dispatchToBullMQ(event)
      collectMetricsOutboxEventsDispatched?.inc()
    } catch (error) {
      const revertResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventStatus.PENDING)

      if (isErr(revertResult)) {
        collectMetricsOutboxEventsRevertFailed?.inc()
        logger.error({ publicId: event.publicId, error: revertResult.error }, OUTBOX_LOGS.REVERT_FATAL)
        captureError(revertResult.error, { publicId: event.publicId })
        return
      }

      collectMetricsOutboxEventsReverted?.inc()
      logger.error({ publicId: event.publicId, error }, OUTBOX_LOGS.DISPATCH_REVERTED)
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

    // Retry seletivo: se um envio parcial anterior registrou destinatários pendentes,
    // despacha apenas esses; caso contrário (lista vazia), despacha o lote completo.
    let finalEmails = emails
    if (event.pendingRecipients.length > 0) {
      const filtered = emails.filter((e) => event.pendingRecipients.includes(e.to))
      if (filtered.length === 0) {
        // Fallback defensivo: nenhum destinatário reconstruído bateu com o filtro
        // (estratégia/payload mudou). Despacha o lote completo para preservar o at-least-once.
        logger.warn({ publicId: event.publicId }, OUTBOX_LOGS.PENDING_RECIPIENTS_UNRESOLVED)
      } else {
        finalEmails = filtered
      }
    }

    await getMailQueue().add(
      QUEUE.JOBS.OUTBOX_DISPATCH,
      {
        publicId: event.publicId,
        emails: finalEmails,
        // Repassa a expiração para o gate do mail worker (job data é JSON)
        ...(event.expiresAt ? { expiresAt: new Date(event.expiresAt).toISOString() } : {}),
      },
      { jobId: event.publicId, ...jobOptions },
    )
  }
}

/**
 * Eventos vindos do Pub/Sub chegam com datas serializadas como string, por isso
 * o `new Date()`.
 */
function isExpired(event: IOutboxEvent): boolean {
  return Boolean(event.expiresAt) && new Date(event.expiresAt as Date).getTime() <= Date.now()
}
