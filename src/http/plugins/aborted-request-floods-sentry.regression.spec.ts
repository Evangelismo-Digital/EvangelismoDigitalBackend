import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression: **every cancelled request was going to become a Sentry event.**
 *
 * `DeadlineExceededError` extends `InfrastructureError`, and the global handler
 * captures every `AppError` in Sentry with a full `logger.error`. Once client
 * disconnects are wired to cancellation, an ordinary user navigating away — and
 * every request during a provider slowdown — would raise an exception event.
 * That is load-shedding working as designed, not a fault: it would have buried
 * the real incidents under a quota-exhausting flood of unactionable noise.
 *
 * `ABORTED` failures are now logged at `warn` and not captured; the
 * `deadline_exceeded` metric label carries the signal instead.
 * Defect D14 in docs/timeout-and-cancellation-model.md.
 */

// Hoisted so the vi.mock factories below can close over them.
const { mockCaptureException, mockWithScope, mockLogger } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockWithScope: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@sentry/node', () => ({
  withScope: (callback: (scope: unknown) => void) => {
    mockWithScope(callback)
    callback({ setUser: vi.fn(), setContext: vi.fn(), setTag: vi.fn() })
  },
  captureException: (error: unknown) => mockCaptureException(error),
}))

vi.mock('@env/index', () => ({ env: { SENTRY_DSN: 'https://example.invalid/1' } }))

vi.mock('@lib/logger', () => ({
  logger: mockLogger,
  getRequestId: () => 'request-id',
  getUserId: () => undefined,
}))

import { errorHandler } from './error-handler.plugin'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'

type Handler = (error: unknown, request: unknown, reply: unknown) => Promise<unknown>

describe('regression: a cancelled request must not raise a Sentry event', () => {
  let handler: Handler
  let reply: { sent: boolean; code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }
  const request = { method: 'GET', url: '/churches/nearest', ip: '203.0.113.10', headers: {} }

  beforeEach(async () => {
    vi.clearAllMocks()

    const app = {
      setErrorHandler: (fn: Handler) => {
        handler = fn
      },
    }
    await errorHandler(app as never, {} as never)

    reply = { sent: false, code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
  })

  it('does not capture a spent request budget', async () => {
    await handler(new DeadlineExceededError('DEADLINE_EXPIRED'), request, reply)

    expect(mockCaptureException).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('records it at warn instead, so the event is not simply lost', async () => {
    const aborted = new DeadlineExceededError('client disconnected')

    await handler(aborted, request, reply)

    expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: aborted }), expect.any(String))
  })

  it('does not flood Sentry across a burst of cancellations', async () => {
    // The failure mode being guarded is volumetric: one event is a curiosity,
    // thousands during a provider slowdown is an outage of the alerting itself.
    for (let i = 0; i < 50; i++) {
      await handler(new DeadlineExceededError('DEADLINE_EXPIRED'), request, reply)
    }

    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('still answers the client exactly as before', async () => {
    await handler(new DeadlineExceededError('DEADLINE_EXPIRED'), request, reply)

    expect(reply.code).toHaveBeenCalledWith(503)
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }))
  })

  it.each([
    ['a per-attempt timeout', () => new TimeoutExceededError('upstream was slow')],
    ['a database failure', () => new DatabaseQueryError(new Error('connection reset'))],
  ])('still captures %s — the silence is only for ABORTED', async (_label, makeError) => {
    // The counterweight: this must not have become "never report anything".
    await handler(makeError(), request, reply)

    expect(mockCaptureException).toHaveBeenCalledOnce()
    expect(mockLogger.error).toHaveBeenCalledOnce()
  })
})
