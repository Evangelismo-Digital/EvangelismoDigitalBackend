import { messages } from 'core/constants/messages'

export class NoRateLimiterSetError extends Error {
  constructor(reason?: unknown) {
    super(`Rate limiter não configurado. Reason: ${reason ?? 'Unknown'}`)
  }
}
