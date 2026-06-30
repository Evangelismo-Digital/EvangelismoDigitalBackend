import { LOCK_KEYS, LOCK_TTL_MS } from 'core/constants/outbox/locks'
import { JOB_NAMES } from 'core/constants/queue/queue'
import { logger } from '@lib/logger'
import { mailQueue } from '@lib/queue/mail-queue'
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
import { OUTBOX_THRESHOLDS } from 'core/constants/outbox/outbox-thresholds'

export class OutboxProcessor {
  private readonly LOCK_KEY = LOCK_KEYS.OUTBOX_PROCESSOR
  private readonly LOCK_TTL_MS = LOCK_TTL_MS.DEFAULT

  constructor(private outboxRepository: IOutboxRepository) {}

  async processEvents(): Promise<void> {
    let lockToken: LockToken | null = null

    try {
      lockToken = await DistributedLock.acquire(this.LOCK_KEY, this.LOCK_TTL_MS)
      if (!lockToken) {
        logger.warn('processEvents: Processamento ignorado. Outra instância já está rodando.')
        return
      }

      const pendingEventsResult = await this.outboxRepository.findPending(OUTBOX_THRESHOLDS.PENDING_FETCH_LIMIT)

      // Verificação do Result
      if (isErr(pendingEventsResult)) {
        logger.error({ error: pendingEventsResult.error }, '❌ Erro de Infra ao buscar eventos pendentes.')
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
      logger.error({ error }, '❌ Erro crítico inesperado no loop principal de processEvents')
    } finally {
      if (lockToken) {
        await DistributedLock.release(this.LOCK_KEY, lockToken)
      }
    }
  }

  async recoverStuckSendingEvents(): Promise<void> {
    let lockToken: LockToken | null = null

    try {
      lockToken = await DistributedLock.acquire(LOCK_KEYS.OUTBOX_RECOVERY, this.LOCK_TTL_MS)
      if (!lockToken) return

      const thresholdDate = new Date(Date.now() - OUTBOX_THRESHOLDS.STUCK_SENDING_MS)
      const stuckEventsResult = await this.outboxRepository.findStuck(thresholdDate)

      // Verificação do Result
      if (isErr(stuckEventsResult)) {
        logger.error({ error: stuckEventsResult.error }, '❌ Erro de Infra ao buscar eventos travados na Outbox.')
        return
      }

      const stuckEvents = stuckEventsResult.value

      if (stuckEvents.length > 0) {
        logger.warn(`♻️ Encontrados ${stuckEvents.length} eventos travados em SENDING. Iniciando recuperação...`)
        for (const event of stuckEvents) {
          await DistributedLock.renew(LOCK_KEYS.OUTBOX_RECOVERY, lockToken, this.LOCK_TTL_MS)
          await this.processSingleEvent(event)
        }
      }
    } catch (error) {
      logger.error({ error }, '❌ Erro crítico inesperado no recoverStuckSendingEvents')
    } finally {
      if (lockToken) {
        await DistributedLock.release(LOCK_KEYS.OUTBOX_RECOVERY, lockToken)
      }
    }
  }

  async processSingleEvent(event: IOutboxEvent): Promise<void> {
    // Phase 1: Transition to SENDING
    const updateResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventType.SENDING)

    if (isErr(updateResult)) {
      logger.error(
        { publicId: event.publicId, error: updateResult.error },
        '❌ Falha ao atualizar status para SENDING. Evento permanece em PENDING.',
      )
      return
    }

    // Phase 2: Dispatch to BullMQ (revert on failure)
    try {
      await this.dispatchToBullMQ(event)
    } catch (error) {
      const revertResult = await this.outboxRepository.updateStatus(event.publicId, IOutboxEventType.PENDING)

      if (isErr(revertResult)) {
        logger.error(
          { publicId: event.publicId, error: revertResult.error },
          '🚨 FATAL: Falha ao reverter status para PENDING. Inconsistência na DB.',
        )
      } else {
        logger.error({ publicId: event.publicId, error }, '❌ Falha no dispatch, revertido para PENDING')
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

    await mailQueue.add(
      JOB_NAMES.OUTBOX_DISPATCH,
      {
        publicId: event.publicId,
        emails: [userJobResult.value, staffJobResult.value],
      },
      { jobId: event.publicId },
    )
  }
}
