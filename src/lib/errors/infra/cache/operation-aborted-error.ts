import { CACHE_ERRORS } from 'messages/errors/cache'

export class OperationAbortedError extends Error {
  public readonly originalReason?: unknown

  constructor(reason?: unknown) {
    super(CACHE_ERRORS.OPERATION_ABORTED.message)
    this.name = 'OperationAbortedError'
    this.originalReason = reason
  }
}
