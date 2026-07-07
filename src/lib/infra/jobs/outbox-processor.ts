import { OUTBOX_CONSTANTS, OUTBOX_CONSTANTS as OUTBOX_CFG } from 'messages/constants/outbox/outbox'
import { QUEUE } from 'messages/constants/queue/queue'
import { logger } from '@lib/logger'
import { getMailQueue } from '@lib/queue/mail-queue'
import { DistributedLock, LockToken } from '@lib/infra/distributed-lock/distributed-lock'
import { ContactEmailStrategy } from '@use-cases/forms/strategies/contact-email-strategy'
import { DecisionForChristEmailStrategy } from '@use-cases/forms/strategies/decision-for-christ-email-strategy'
import { isErr } from 'core/shared/result'
import {
  IOutboxRepository,
  IOutboxEvent,
  IOutboxEventType,
} from 'core/contracts/repository/outbox-repository.interface'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'

export class OutboxProcessor {
  private readonly LOCK_KEY = OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_PROCESSOR
  private readonly LOCK_TTL_MS = OUTBOX_CONSTANTS.LOCK_TTL_MS.DEFAULT

  constructor(private outboxRepository: IOutboxRepository) {}

  async processEvents(): Promise<void> {
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
    } finally {
      if (lockToken) {
        await DistributedLock.release(this.LOCK_KEY, lockToken)
      }
    }
  }

  async recoverStuckSendingEvents(): Promise<void> {
    let lockToken: LockToken | null = null

    try {
      lockToken = await DistributedLock.acquire(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY, this.LOCK_TTL_MS)
      if (!lockToken) return

      const thresholdDate = new Date(Date.now() - OUTBOX_CFG.THRESHOLDS.STUCK_SENDING_MS)
      const stuckEventsResult = await this.outboxRepository.findStuck(thresholdDate)

      // Verificação do Result
      if (isErr(stuckEventsResult)) {
        logger.error({ error: stuckEventsResult.error }, OUTBOX_LOGS.STUCK_FETCH_ERROR)
        return
      }

      const stuckEvents = stuckEventsResult.value

      if (stuckEvents.length > 0) {
        logger.warn(`♻️ Encontrados ${stuckEvents.length} eventos travados em SENDING. Iniciando recuperação...`)
        for (const event of stuckEvents) {
          await DistributedLock.renew(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY, lockToken, this.LOCK_TTL_MS)
          await this.processSingleEvent(event)
        }
      }
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.CRITICAL_RECOVERY_ERROR)
    } finally {
      if (lockToken) {
        await DistributedLock.release(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY, lockToken)
      }
    }
  }

  async processSingleEvent(event: IOutboxEvent): Promise<void> {
    // Phase 1: Transition to SENDING
    const updateResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventType.SENDING)

    if (isErr(updateResult)) {
      logger.error({ publicId: event.publicId, error: updateResult.error }, OUTBOX_LOGS.STATUS_UPDATE_FAILED)
      return
    }

    // Phase 2: Dispatch to BullMQ (revert on failure)
    try {
      await this.dispatchToBullMQ(event)
    } catch (error) {
      const revertResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventType.PENDING)

      if (isErr(revertResult)) {
        logger.error({ publicId: event.publicId, error: revertResult.error }, OUTBOX_LOGS.REVERT_FATAL)
      } else {
        logger.error({ publicId: event.publicId, error }, OUTBOX_LOGS.DISPATCH_REVERTED)
      }
    }
  }

  private async dispatchToBullMQ(event: IOutboxEvent): Promise<void> {
    const payload = event.payload as FormPayload

    const strategy = payload.decisaoPorCristo ? new DecisionForChristEmailStrategy() : new ContactEmailStrategy()

    const userJobResult = strategy.buildUserEmail(payload)
    if (isErr(userJobResult)) {
      throw userJobResult.error
    }

    const staffJobResult = strategy.buildStaffEmail(payload)
    if (isErr(staffJobResult)) {
      throw staffJobResult.error
    }

    await getMailQueue().add(
      QUEUE.JOBS.OUTBOX_DISPATCH,
      {
        publicId: event.publicId,
        emails: [userJobResult.value, staffJobResult.value],
      },
      { jobId: event.publicId },
    )
  }
}
