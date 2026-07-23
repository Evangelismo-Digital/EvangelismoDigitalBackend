import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ZodError, z } from 'zod'

// ----- Hoisted mocks -----
const {
  mockCaptureException,
  mockWithScope,
  mockSetUser,
  mockSetContext,
  mockSetTag,
  mockLogger,
  mockGetRequestId,
  mockGetUserId,
} = vi.hoisted(() => {
  const mockSetUser = vi.fn()
  const mockSetContext = vi.fn()
  const mockSetTag = vi.fn()
  const mockCaptureException = vi.fn()
  const mockWithScope = vi.fn((callback) => {
    callback({ setUser: mockSetUser, setContext: mockSetContext, setTag: mockSetTag })
  })

  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }

  const mockGetRequestId = vi.fn(() => 'test-request-id')
  const mockGetUserId = vi.fn(() => undefined as string | undefined)

  return {
    mockCaptureException,
    mockWithScope,
    mockSetUser,
    mockSetContext,
    mockSetTag,
    mockLogger,
    mockGetRequestId,
    mockGetUserId,
  }
})

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
  withScope: mockWithScope,
}))

vi.mock('@env/index', () => ({
  env: {
    SENTRY_DSN: 'https://fake@sentry.io/123',
    NODE_ENV: 'production',
  },
}))

vi.mock('@lib/logger', () => ({
  logger: mockLogger,
  getRequestId: mockGetRequestId,
  getUserId: mockGetUserId,
}))

import { errorHandler } from './error-handler.plugin'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { DatabaseQueryError } from '../../errors/infrastructure/database-query-error'
import { ServiceBusyError } from '../../errors/infrastructure/service-busy-error'

// ----- Test helpers -----
function createMockReply(overrides: Record<string, unknown> = {}) {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sent: false,
    ...overrides,
  }
  return reply
}

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    url: '/test',
    ip: '203.0.113.10',
    headers: { 'user-agent': 'vitest/1.0' },
    routeOptions: { url: '/test' },
    ...overrides,
  }
}

type ErrorHandler = (error: Error & { statusCode?: number }, request: unknown, reply: unknown) => void

async function getErrorHandler(): Promise<ErrorHandler> {
  let handler: ErrorHandler | null = null

  const app = {
    setErrorHandler: vi.fn((fn: ErrorHandler) => {
      handler = fn
    }),
  }

  // Call the raw plugin function (fastify-plugin wraps it)
  await errorHandler(app as never, {} as never)

  if (!handler) {
    throw new Error('setErrorHandler was not called')
  }

  return handler
}

// ----- Tests -----
describe('errorHandlerPlugin', () => {
  let handler: ErrorHandler
  let reply: ReturnType<typeof createMockReply>
  let request: ReturnType<typeof createMockRequest>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockGetUserId.mockReturnValue(undefined)
    handler = await getErrorHandler()
    reply = createMockReply()
    request = createMockRequest()
  })

  describe('reply.sent guard', () => {
    it('bails out without sending a response when reply is already sent', async () => {
      reply = createMockReply({ sent: true })

      await handler(new Error('should be ignored'), request, reply)

      expect(reply.code).not.toHaveBeenCalled()
      expect(reply.send).not.toHaveBeenCalled()
      expect(mockLogger.warn).toHaveBeenCalledWith('Handler de erro chamado após resposta já enviada — ignorando')
    })
  })

  describe('ZodError handling', () => {
    it('responds with 400 and validation details without capturing in Sentry', async () => {
      const schema = z.object({ name: z.string() })
      let zodError: ZodError

      try {
        schema.parse({ name: 123 })
      } catch (e) {
        zodError = e as ZodError
      }

      await handler(zodError!, request, reply)

      expect(reply.code).toHaveBeenCalledWith(400)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        }),
      )
      expect(mockCaptureException).not.toHaveBeenCalled()
      expect(mockWithScope).not.toHaveBeenCalled()
    })
  })

  describe('SyntaxError handling', () => {
    it('responds with 400 and INVALID_JSON code without capturing in Sentry', async () => {
      const syntaxError = new SyntaxError('Unexpected token')

      await handler(syntaxError, request, reply)

      expect(reply.code).toHaveBeenCalledWith(400)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_JSON',
        }),
      )
      expect(mockCaptureException).not.toHaveBeenCalled()
      expect(mockWithScope).not.toHaveBeenCalled()
    })
  })

  describe('DomainError handling', () => {
    it('responds with the correct HTTP status and user-facing message without Sentry', async () => {
      const domainError = new UserNotFoundError()

      await handler(domainError, request, reply)

      expect(reply.code).toHaveBeenCalledWith(404)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: domainError.body.message,
          code: domainError.body.code,
        }),
      )
      expect(mockCaptureException).not.toHaveBeenCalled()
      expect(mockWithScope).not.toHaveBeenCalled()
    })
  })

  describe('InfrastructureError / AppError handling', () => {
    it('logs the error, captures in Sentry with request context, and sanitizes the response', async () => {
      const infraError = new DatabaseQueryError(new Error('Connection refused'))

      await handler(infraError, request, reply)

      // Logged with full error details
      expect(mockLogger.error).toHaveBeenCalledOnce()

      // Captured in Sentry with scope isolation
      expect(mockWithScope).toHaveBeenCalledOnce()
      expect(mockCaptureException).toHaveBeenCalledWith(infraError)

      // Request context attached
      expect(mockSetContext).toHaveBeenCalledWith(
        'request',
        expect.objectContaining({
          requestId: 'test-request-id',
          method: 'GET',
          url: '/test',
          ip: '203.0.113.10',
        }),
      )

      expect(mockSetTag).toHaveBeenCalledWith('errorType', 'DatabaseQueryError')

      // Sanitized response — no internal details
      expect(reply.code).toHaveBeenCalledWith(500)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        }),
      )
    })

    it('returns SERVICE_UNAVAILABLE for TOO_MANY_REQUESTS errors', async () => {
      const busyError = new ServiceBusyError('ViaCEP')

      await handler(busyError, request, reply)

      expect(reply.code).toHaveBeenCalledWith(429)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SERVICE_UNAVAILABLE',
        }),
      )
    })

    it('attaches userId to Sentry scope when user is authenticated', async () => {
      mockGetUserId.mockReturnValue('user-123')

      const infraError = new DatabaseQueryError()

      await handler(infraError, request, reply)

      expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-123' })
    })

    it('does not set Sentry user when request is unauthenticated', async () => {
      mockGetUserId.mockReturnValue(undefined)

      const infraError = new DatabaseQueryError()

      await handler(infraError, request, reply)

      expect(mockSetUser).not.toHaveBeenCalled()
    })
  })

  describe('Fastify internal errors', () => {
    it('forwards errors with numeric statusCode as-is without Sentry capture', async () => {
      const fastifyError = Object.assign(new Error('Unauthorized'), { statusCode: 401 })

      await handler(fastifyError, request, reply)

      expect(reply.code).toHaveBeenCalledWith(401)
      expect(reply.send).toHaveBeenCalledWith({ message: 'Unauthorized' })
      expect(mockCaptureException).not.toHaveBeenCalled()
    })

    it('does NOT forward errors with non-number statusCode (falls through to unknown)', async () => {
      const badError = Object.assign(new Error('Bad statusCode'), {
        statusCode: 'not-a-number' as unknown as number,
      })

      await handler(badError, request, reply)

      // Should fall through to the unknown/unhandled branch (500), not forward the string
      expect(reply.code).toHaveBeenCalledWith(500)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        }),
      )
      // Should be captured in Sentry since it's an unhandled error
      expect(mockWithScope).toHaveBeenCalledOnce()
      expect(mockCaptureException).toHaveBeenCalledWith(badError)
    })
  })

  describe('Unknown / unhandled errors', () => {
    it('logs, captures in Sentry with request context, and returns sanitized 500', async () => {
      const unknownError = new Error('Something completely unexpected')

      await handler(unknownError, request, reply)

      expect(mockLogger.error).toHaveBeenCalledOnce()
      expect(mockWithScope).toHaveBeenCalledOnce()
      expect(mockCaptureException).toHaveBeenCalledWith(unknownError)
      expect(mockSetTag).toHaveBeenCalledWith('errorType', 'Error')

      expect(reply.code).toHaveBeenCalledWith(500)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        }),
      )
    })

    it('attaches route pattern from routeOptions when available', async () => {
      const requestWithRoute = createMockRequest({
        url: '/users/abc-123',
        routeOptions: { url: '/users/:publicId' },
      })

      await handler(new Error('test'), requestWithRoute, reply)

      expect(mockSetTag).toHaveBeenCalledWith('route', '/users/:publicId')
    })

    it('falls back to request.url when routeOptions is undefined', async () => {
      const requestNoRoute = createMockRequest({
        url: '/unknown-path',
        routeOptions: undefined,
      })

      await handler(new Error('test'), requestNoRoute, reply)

      expect(mockSetTag).toHaveBeenCalledWith('route', '/unknown-path')
    })
  })

  describe('outer try/catch safety net', () => {
    it('still returns 500 when the logger throws inside the error handler', async () => {
      // Make logger.error throw to simulate a logger failure
      mockLogger.error.mockImplementationOnce(() => {
        throw new Error('Logger exploded')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await handler(new Error('trigger unknown branch'), request, reply)

      // Should have used console.error as fallback
      expect(consoleSpy).toHaveBeenCalledWith('O handler de erro lançou uma exceção:', expect.any(Error))

      // Should still send a clean 500
      expect(reply.code).toHaveBeenCalledWith(500)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        }),
      )

      consoleSpy.mockRestore()
    })

    it('does not attempt to send when reply is already sent inside catch block', async () => {
      // Make logger.error throw, AND mark reply as already sent
      mockLogger.error.mockImplementationOnce(() => {
        // Simulate reply being sent before the catch block runs
        reply.sent = true
        throw new Error('Logger exploded')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await handler(new Error('trigger unknown branch'), request, reply)

      // console.error should fire
      expect(consoleSpy).toHaveBeenCalled()

      // reply.code should NOT have been called (reply.sent was true in catch)
      expect(reply.code).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })
})

describe('errorHandlerPlugin (no Sentry DSN)', () => {
  it('does not attempt Sentry capture when SENTRY_DSN is absent', async () => {
    vi.resetModules()

    vi.doMock('@env/index', () => ({
      env: {
        SENTRY_DSN: undefined,
        NODE_ENV: 'production',
      },
    }))

    vi.doMock('@sentry/node', () => ({
      captureException: mockCaptureException,
      withScope: mockWithScope,
    }))

    vi.doMock('@lib/logger', () => ({
      logger: mockLogger,
      getRequestId: mockGetRequestId,
      getUserId: mockGetUserId,
    }))

    // @ts-expect-error — Dynamic import after vi.resetModules() is unresolvable by tsc but works at runtime via vite-tsconfig-paths
    const { errorHandler: errorHandlerNoDsn } = await import('@http/plugins/error-handler.plugin')

    let handler: ErrorHandler | null = null
    const app = {
      setErrorHandler: vi.fn((fn: ErrorHandler) => {
        handler = fn
      }),
    }

    await errorHandlerNoDsn(app as never, {} as never)

    mockWithScope.mockClear()
    mockCaptureException.mockClear()

    const reply = createMockReply()
    await handler!(new Error('test'), createMockRequest(), reply)

    expect(mockWithScope).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
    expect(reply.code).toHaveBeenCalledWith(500)
  })
})
