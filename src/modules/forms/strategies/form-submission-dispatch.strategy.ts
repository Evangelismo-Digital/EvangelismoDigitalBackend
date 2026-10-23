import {
  IOutboxDispatchPlan,
  IOutboxDispatchStrategy,
} from '@infra/outbox/interfaces/outbox-dispatch-strategy.interface'
import { IOutboxEvent } from '@infra/outbox/repositories/outbox-repository.interface'
import { FormPayload } from '@modules/forms/dto/form-payload.type'
import { Result, ok, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import { ContactEmailStrategy } from './contact-email.strategy'
import { DecisionForChristEmailStrategy } from './decision-for-christ-email.strategy'

/**
 * Despacho de eventos FormSubmissionCreated: e-mail para o usuário + e-mail
 * para a equipe. O roteamento por formato de payload (decisaoPorCristo) é
 * detalhe interno do domínio de formulários — fica aqui, não no processor.
 * Sem jobOptions: usa os defaults da fila.
 */
export class FormSubmissionDispatchStrategy implements IOutboxDispatchStrategy {
  async buildDispatch(event: IOutboxEvent): Promise<Result<IOutboxDispatchPlan, AppError>> {
    const payload = event.payload as FormPayload

    const strategy = payload.decisaoPorCristo ? new DecisionForChristEmailStrategy() : new ContactEmailStrategy()

    const userJobResult = await strategy.buildUserEmail(payload)
    if (isErr(userJobResult)) {
      return userJobResult
    }

    const staffJobResult = await strategy.buildStaffEmail(payload)
    if (isErr(staffJobResult)) {
      return staffJobResult
    }

    return ok({ emails: [userJobResult.value, staffJobResult.value] })
  }
}
