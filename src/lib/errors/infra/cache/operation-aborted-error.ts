import { OPERATION_ABORTED_ERROR } from 'messages/errors/system/cache'

export class OperationAbortedError extends Error {
  public readonly originalReason?: unknown

  constructor(reason?: unknown) {
    super(OPERATION_ABORTED_ERROR.message)
    this.name = 'OperationAbortedError'
    this.originalReason = reason
  }
}
