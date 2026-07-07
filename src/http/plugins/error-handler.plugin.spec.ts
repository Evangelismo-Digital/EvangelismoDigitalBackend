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
function createMockReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
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

  describe('ZodError handling', () => {
    it('responds with 400 and validation details without capturing in Sentry', () => {
      const schema = z.object({ name: z.string() })
      let zodError: ZodError

      try {
        schema.parse({ name: 123 })
      } catch (e) {
        zodError = e as ZodError
      }

      handler(zodError!, request, reply)

      expect(reply.status).toHaveBeenCalledWith(400)
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
    it('responds with 400 and INVALID_JSON code without capturing in Sentry', () => {
      const syntaxError = new SyntaxError('Unexpected token')

      handler(syntaxError, request, reply)

      expect(reply.status).toHaveBeenCalledWith(400)
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
    it('responds with the correct HTTP status and user-facing message without Sentry', () => {
      const domainError = new UserNotFoundError()

      handler(domainError, request, reply)

      expect(reply.status).toHaveBeenCalledWith(404)
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
    it('logs the error, captures in Sentry with request context, and sanitizes the response', () => {
      const infraError = new DatabaseQueryError(new Error('Connection refused'))

      handler(infraError, request, reply)

      // Logged with full error details
      expect(mockLogger.error).toHaveBeenCalledOnce()

      // Captured in Sentry with scope isolation
      expect(mockWithScope).toHaveBeenCalledOnce()
      expect(mockCaptureException).toHaveBeenCalledWith(infraError)

      // Request context attached
      expect(mockSetContext).toHaveBeenCalledWith('request', expect.objectContaining({
        requestId: 'test-request-id',
        method: 'GET',
        url: '/test',
        ip: '203.0.113.10',
      }))

      expect(mockSetTag).toHaveBeenCalledWith('errorType', 'DatabaseQueryError')

      // Sanitized response — no internal details
      expect(reply.status).toHaveBeenCalledWith(500)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        }),
      )
    })

    it('returns SERVICE_UNAVAILABLE for TOO_MANY_REQUESTS errors', () => {
      const busyError = new ServiceBusyError('ViaCEP')

      handler(busyError, request, reply)

      expect(reply.status).toHaveBeenCalledWith(429)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SERVICE_UNAVAILABLE',
        }),
      )
    })

    it('attaches userId to Sentry scope when user is authenticated', () => {
      mockGetUserId.mockReturnValue('user-123')

      const infraError = new DatabaseQueryError()

      handler(infraError, request, reply)

      expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-123' })
    })

    it('does not set Sentry user when request is unauthenticated', () => {
      mockGetUserId.mockReturnValue(undefined)

      const infraError = new DatabaseQueryError()

      handler(infraError, request, reply)

      expect(mockSetUser).not.toHaveBeenCalled()
    })
  })

  describe('Fastify internal errors', () => {
    it('forwards errors with statusCode as-is without Sentry capture', () => {
      const fastifyError = Object.assign(new Error('Unauthorized'), { statusCode: 401 })

      handler(fastifyError, request, reply)

      expect(reply.status).toHaveBeenCalledWith(401)
      expect(reply.send).toHaveBeenCalledWith({ message: 'Unauthorized' })
      expect(mockCaptureException).not.toHaveBeenCalled()
    })
  })

  describe('Unknown / unhandled errors', () => {
    it('logs, captures in Sentry with request context, and returns sanitized 500', () => {
      const unknownError = new Error('Something completely unexpected')

      handler(unknownError, request, reply)

      expect(mockLogger.error).toHaveBeenCalledOnce()
      expect(mockWithScope).toHaveBeenCalledOnce()
      expect(mockCaptureException).toHaveBeenCalledWith(unknownError)
      expect(mockSetTag).toHaveBeenCalledWith('errorType', 'Error')

      expect(reply.status).toHaveBeenCalledWith(500)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        }),
      )
    })

    it('attaches route pattern from routeOptions when available', () => {
      const requestWithRoute = createMockRequest({
        url: '/users/abc-123',
        routeOptions: { url: '/users/:publicId' },
      })

      handler(new Error('test'), requestWithRoute, reply)

      expect(mockSetTag).toHaveBeenCalledWith('route', '/users/:publicId')
    })

    it('falls back to request.url when routeOptions is undefined', () => {
      const requestNoRoute = createMockRequest({
        url: '/unknown-path',
        routeOptions: undefined,
      })

      handler(new Error('test'), requestNoRoute, reply)

      expect(mockSetTag).toHaveBeenCalledWith('route', '/unknown-path')
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
    handler!(new Error('test'), createMockRequest(), reply)

    expect(mockWithScope).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
    expect(reply.status).toHaveBeenCalledWith(500)
  })
})
