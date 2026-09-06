import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import z, { ZodError } from 'zod'
import * as Sentry from '@sentry/node'
import { env } from '@env/index'
import { logger, getRequestId, getUserId } from '@lib/logger'
import { HTTP_ERRORS } from 'messages/errors/http'
import { AppError } from 'errors/app-error'
import { DomainError } from 'errors/domain-error'
import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { toHttpStatus } from 'errors/http-errors/http-error-status.mapper'
import { ZodValidationError } from 'errors/http-errors/zod-validation-error'

/**
 * Captures an exception in Sentry with full request context isolation.
 * Uses Sentry.withScope() to prevent context bleed between concurrent requests.
 */
function captureWithRequestContext(error: Error, request: FastifyRequest): void {
  if (!env.SENTRY_DSN) {
    return
  }

  Sentry.withScope((scope) => {
    const requestId = getRequestId()
    const userId = getUserId()

    if (userId) {
      scope.setUser({ id: userId })
    }

    scope.setContext('request', {
      requestId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    })

    scope.setTag('route', request.routeOptions?.url ?? request.url)
    scope.setTag('method', request.method)
    scope.setTag('errorType', error.constructor.name)

    Sentry.captureException(error)
  })
}

/** Zod validation errors → safe response carrying the validation details. */
function respondZodError(error: unknown, _request: FastifyRequest, reply: FastifyReply) {
  const zodValidationError = new ZodValidationError(z.treeifyError(error as ZodError))

  logger.debug(z.treeifyError(error as ZodError), 'Ocorreu um erro de validação')

  return reply.code(toHttpStatus(zodValidationError.type)).send({
    message: zodValidationError.body.message,
    code: zodValidationError.body.code,
    issues: zodValidationError.body.issues,
  })
}

/** JSON parse errors → safe response. */
function respondSyntaxError(error: unknown, _request: FastifyRequest, reply: FastifyReply) {
  logger.error(error, 'JSON inválido recebido')

  return reply.code(400).send({
    message: HTTP_ERRORS.INVALID_JSON.message,
    code: HTTP_ERRORS.INVALID_JSON.code,
  })
}

/** DomainError → safe, sent as-is (user-facing messages). */
function respondDomainError(error: unknown, _request: FastifyRequest, reply: FastifyReply) {
  const domainError = error as DomainError

  return reply.code(toHttpStatus(domainError.type)).send({
    message: domainError.body.message,
    code: domainError.body.code,
    issues: domainError.body.issues,
  })
}

/**
 * An ABORTED failure is expected load-shedding, not an exception: the request
 * budget ran out, or the client went away. Capturing it would turn every
 * abandoned request — and every request during a provider slowdown — into a
 * Sentry event nobody can action, drowning the real ones. It is logged at
 * `warn` instead, and the `deadline_exceeded` metric label carries the signal.
 */
function reportAppError(error: AppError, request: FastifyRequest): void {
  if (error.failureMode === FailureMode.ABORTED) {
    logger.warn({ err: error }, 'Requisição cancelada antes da conclusão (orçamento esgotado ou cliente desconectado)')
    return
  }

  logger.error({ err: error, cause: error.cause }, 'Ocorreu um erro de infraestrutura/sistema')
  captureWithRequestContext(error, request)
}

/** InfrastructureError / SystemError → log, report, and sanitize the response. */
function respondAppError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const appError = error as AppError
  const isServiceUnavailable =
    appError.type === ErrorType.SERVICE_UNAVAILABLE || appError.type === ErrorType.TOO_MANY_REQUESTS

  reportAppError(appError, request)

  return reply.code(toHttpStatus(appError.type)).send({
    message: isServiceUnavailable ? HTTP_ERRORS.SERVICE_UNAVAILABLE.message : HTTP_ERRORS.INTERNAL_SERVER.message,
    code: isServiceUnavailable ? HTTP_ERRORS.SERVICE_UNAVAILABLE.code : HTTP_ERRORS.INTERNAL_SERVER.code,
  })
}

/** Fastify internal errors (JWT, rate limit, ...) carry their own numeric status. */
function isFastifyError(error: unknown): boolean {
  return error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
}

function respondFastifyError(error: unknown, _request: FastifyRequest, reply: FastifyReply) {
  const fastifyError = error as Error & { statusCode: number }

  return reply.code(fastifyError.statusCode).send({ message: fastifyError.message })
}

/** Anything unrecognised → log, capture, and return a sanitized 500. */
function respondUnknownError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof Error) {
    logger.error(error, 'Ocorreu um erro não tratado')
    captureWithRequestContext(error, request)
  } else {
    logger.error('Ocorreu um erro não tratado: valor lançado não é uma instância de Error')
    captureWithRequestContext(new Error('Valor não-Error lançado no handler de requisição'), request)
  }

  return reply.code(500).send({
    message: HTTP_ERRORS.INTERNAL_SERVER.message,
    code: HTTP_ERRORS.INTERNAL_SERVER.code,
  })
}

/**
 * Ordered dispatch table. Order is load-bearing: DomainError extends AppError,
 * so it must be matched first to keep its user-facing body from being
 * sanitized away.
 */
const ERROR_RULES: ReadonlyArray<{
  matches: (error: unknown) => boolean
  respond: (error: unknown, request: FastifyRequest, reply: FastifyReply) => unknown
}> = [
  { matches: (error) => error instanceof ZodError, respond: respondZodError },
  { matches: (error) => error instanceof SyntaxError, respond: respondSyntaxError },
  { matches: (error) => error instanceof DomainError, respond: respondDomainError },
  { matches: (error) => error instanceof AppError, respond: respondAppError },
  { matches: isFastifyError, respond: respondFastifyError },
]

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler(async (error, request, reply) => {
    // Guard: if a response was already sent (e.g. the handler called
    // reply.send() then threw), bail out to avoid FST_ERR_REP_ALREADY_SENT.
    if (reply.sent) {
      logger.warn('Handler de erro chamado após resposta já enviada — ignorando')
      return
    }

    try {
      const rule = ERROR_RULES.find(({ matches }) => matches(error))

      return await (rule ? rule.respond(error, request, reply) : respondUnknownError(error, request, reply))
    } catch (handlerError) {
      // Safety net: if anything inside the error handler itself throws
      // (e.g. Sentry SDK failure, logger crash), still give the client a clean 500.
      console.error('O handler de erro lançou uma exceção:', handlerError)

      if (!reply.sent) {
        return reply.code(500).send({
          message: HTTP_ERRORS.INTERNAL_SERVER.message,
          code: HTTP_ERRORS.INTERNAL_SERVER.code,
        })
      }
    }
  })
}

export const errorHandler = fp(errorHandlerPlugin, {
  name: 'error-handler',
})
