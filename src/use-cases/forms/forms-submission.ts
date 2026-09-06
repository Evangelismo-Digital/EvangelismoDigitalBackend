import { IOutboxEventRegistration } from 'core/contracts/use-cases/outbox-event/outbox-event.interface'
import { FormsRepository, IFormSubmissionInputData } from 'core/contracts/repository/forms-repository.interface'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import { FormsAlreadyExistsError } from '@use-cases/errors/forms/forms-already-exists-error'
import { ok, err, isOk, isErr, Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { OUTBOX_EVENT_TYPES } from 'core/types/outbox/outbox-event-input'

type Response = Result<
  {
    sanitizedFormSubmission: FormPayload
    outboxEvent: IOutboxEvent
  },
  AppError
>

export class FormsSubmissionUseCase {
  constructor(
    private formsSubmissionRepository: FormsRepository,
    private eventRegistration: IOutboxEventRegistration,
  ) {}

  async execute(request: IFormSubmissionInputData): Promise<Response> {
    const findEmailResult = await this.formsSubmissionRepository.findByEmail(request.email)

    if (isOk(findEmailResult)) {
      return err(new FormsAlreadyExistsError())
    }

    if (findEmailResult.error.body.code !== 'FORM_NOT_FOUND') {
      return findEmailResult
    }

    // 2. Persistência (Escrita)
    // Como este UseCase será decorado, esta chamada ocorrerá dentro de uma transação do Prisma
    const formSubmissionResult = await this.formsSubmissionRepository.create({
      name: request.name,
      lastName: request.lastName,
      email: request.email,
      decisaoPorCristo: request.decisaoPorCristo,
      location: request.location || undefined,
      ipAddress: request.ipAddress || undefined,
    })

    if (isErr(formSubmissionResult)) {
      return formSubmissionResult
    }

    // Sanitização: remove campos sensíveis ou desnecessários para a notificação
    const sanitizedFormSubmission = sanitize(formSubmissionResult.value)

    return await this.registerNotification(sanitizedFormSubmission)
  }

  /**
   * 3. Side-effect seguro (Outbox Pattern)
   *
   * Grava o evento em 'outbox_events' NA MESMA TRANSAÇÃO do formulário. O
   * ipAddress fica fora do payload persistido: é dado sensível e desnecessário
   * para o e-mail.
   */
  private async registerNotification(sanitizedFormSubmission: SanitizedFormSubmission): Promise<Response> {
    const outboxEvent = await this.eventRegistration.register({
      type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
      payload: {
        name: sanitizedFormSubmission.name,
        lastName: sanitizedFormSubmission.lastName,
        email: sanitizedFormSubmission.email,
        decisaoPorCristo: sanitizedFormSubmission.decisaoPorCristo,
        location: sanitizedFormSubmission.location,
      },
    })

    if (isErr(outboxEvent)) {
      return outboxEvent
    }

    return ok({
      sanitizedFormSubmission,
      outboxEvent: outboxEvent.value,
    })
  }
}

type SanitizedFormSubmission = {
  name: string
  lastName: string
  email: string
  decisaoPorCristo: boolean
  location: string | null
  ipAddress: string | null
}

function sanitize(formSubmission: {
  name: string
  lastName: string
  email: string
  decisaoPorCristo: boolean
  location?: string | null
  ipAddress?: string | null
}): SanitizedFormSubmission {
  return {
    name: formSubmission.name,
    lastName: formSubmission.lastName,
    email: formSubmission.email,
    decisaoPorCristo: formSubmission.decisaoPorCristo,
    location: formSubmission.location ?? null,
    ipAddress: formSubmission.ipAddress ?? null,
  }
}
