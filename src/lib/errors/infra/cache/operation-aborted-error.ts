import { OPERATION_ABORTED_ERROR } from 'messages/constants/errors/cache'

export class OperationAbortedError extends Error {
  public readonly originalReason?: unknown

  constructor(reason?: unknown) {
    super(OPERATION_ABORTED_ERROR.message)
    this.name = 'OperationAbortedError'
    this.originalReason = reason
  }
}
