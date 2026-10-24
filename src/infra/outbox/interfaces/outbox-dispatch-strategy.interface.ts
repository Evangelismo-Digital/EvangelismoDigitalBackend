import type { JobsOptions } from 'bullmq'
import { IMailJobData } from '@infra/mail/interfaces/mail-job-data.interface'
import { IOutboxEvent } from '@infra/outbox/repositories/outbox-repository.interface'
import { Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

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
  buildDispatch(event: IOutboxEvent): Promise<Result<IOutboxDispatchPlan, AppError>>
}
