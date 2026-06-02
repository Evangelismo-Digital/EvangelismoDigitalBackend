import { TIMEOUT_EXCEEDED_ERROR } from 'messages/errors/providers/providers-error-messages'

export class TimeoutExceededOnFetchError extends Error {
  public readonly originalReason?: unknown

  constructor(reason?: unknown) {
    super(TIMEOUT_EXCEEDED_ERROR.message)

    this.name = 'TimeoutExceededOnFetchError'
    this.originalReason = reason
  }
}
