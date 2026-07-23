import type { JobsOptions } from 'bullmq'
import { IMailJobData } from 'core/contracts/lib/queue/mail-job-data.interface'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface IOutboxDispatchPlan {
  emails: IMailJobData[]
  /** Opções de job por tipo de evento; ausente = defaults da fila. */
  jobOptions?: JobsOptions
}

/**
 * Estratégia de despacho por tipo de evento da Outbox. Cada tipo (formulário,
 * reset de senha, ...) implementa a sua e é registrada na
 * OutboxDispatchStrategyRegistry — o processor não conhece tipos concretos.
 */
export interface IOutboxDispatchStrategy {
  buildDispatch(event: IOutboxEvent): Result<IOutboxDispatchPlan, AppError>
}
