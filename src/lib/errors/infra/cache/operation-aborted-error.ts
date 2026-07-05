import { messages } from 'messages/constants/messages'

export class OperationAbortedError extends Error {
  public readonly originalReason?: unknown

  constructor(reason?: unknown) {
    super(messages.errors.operationAbortedError)
    this.name = 'OperationAbortedError'
    this.originalReason = reason
  }
}
