import { InfrastructureError } from 'errors/infrastructure-error'
import { ErrorType } from 'core/types/error-type/error-type'
import { OUTBOX_ERRORS } from 'messages/errors/outbox'
import { SystemError } from 'errors/system-error'
import { DomainError } from 'errors/domain-error'

// --- Contexto HTTP (Disparado pela API durante o cadastro) ---
export class OutboxEventNotFoundHttpError extends DomainError {
  constructor() {
    super(OUTBOX_ERRORS.EVENT_NOT_FOUND, ErrorType.NOT_FOUND)
  }
}

export class OutboxOperationFailedHttpError extends SystemError {
  constructor() {
    super(OUTBOX_ERRORS.OPERATION_FAILED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}

// --- Contexto Infraestrutura (Disparado pelo BullMQ / Cron) ---
export class OutboxEventNotFoundInfraError extends InfrastructureError {
  constructor(originalError?: unknown) {
    super(OUTBOX_ERRORS.EVENT_NOT_FOUND, originalError)
  }
}

export class OutboxOperationFailedInfraError extends InfrastructureError {
  constructor(originalError?: unknown) {
    super(OUTBOX_ERRORS.OPERATION_FAILED, originalError)
  }
}
