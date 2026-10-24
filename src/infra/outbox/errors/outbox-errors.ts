import { InfrastructureError } from '@common/errors/infrastructure-error'
import { ErrorType } from '@common/types/error-type/error-type'
import { OUTBOX_ERRORS } from '@common/messages/errors/outbox'
import { SystemError } from '@common/errors/system-error'
import { DomainError } from '@common/errors/domain-error'

// --- Contexto Transacional / Domínio (Disparado sincronamente durante o registro do evento) ---
export class OutboxEventNotFoundDomainError extends DomainError {
  constructor() {
    super(OUTBOX_ERRORS.EVENT_NOT_FOUND, ErrorType.NOT_FOUND)
  }
}

export class OutboxOperationFailedSystemError extends SystemError {
  constructor() {
    super(OUTBOX_ERRORS.OPERATION_FAILED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}

// --- Contexto Infraestrutura (Disparado pelos workers BullMQ / manutenção em background) ---
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
