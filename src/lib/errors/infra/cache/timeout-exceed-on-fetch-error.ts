import { GEO_ERRORS } from 'messages/errors/geolocation'

export class TimeoutExceededOnFetchError extends Error {
  public readonly originalReason?: unknown

  constructor(reason?: unknown) {
    super(GEO_ERRORS.TIMEOUT_EXCEEDED.message)

    this.name = 'TimeoutExceededOnFetchError'
    this.originalReason = reason
  }
}
