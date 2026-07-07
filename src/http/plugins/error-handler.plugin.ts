import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import z, { ZodError } from 'zod'
import * as Sentry from '@sentry/node'
import { env } from '@env/index'
import { logger } from '@lib/logger'
import { HTTP_ERRORS } from 'messages/errors/http'
import { AppError } from 'errors/app-error'
import { DomainError } from 'errors/domain-error'
import { ErrorType } from 'core/types/error-type/error-type'
import { toHttpStatus } from 'errors/http-errors/http-error-status.mapper'
import { ZodValidationError } from 'errors/http-errors/zod-validation-error'

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, _request, reply) => {
    // 1. Zod validation errors → safe response with validation details
    if (error instanceof ZodError) {
      const zodValidationError = new ZodValidationError(z.treeifyError(error))
      const httpCode = toHttpStatus(zodValidationError.type)

      logger.debug(z.treeifyError(error), 'Validation error occurred')

      return reply.status(httpCode).send({
        message: zodValidationError.body.message,
        code: zodValidationError.body.code,
        issues: zodValidationError.body.issues,
      })
    }

    // 2. JSON parse errors → safe response
    if (error instanceof SyntaxError) {
      logger.error(error, 'JSON inválido recebido')
      return reply.status(400).send({
        message: HTTP_ERRORS.INVALID_JSON.message,
        code: HTTP_ERRORS.INVALID_JSON.code,
      })
    }

    // 3. DomainError → safe, send as-is (user-facing messages)
    if (error instanceof DomainError) {
      const httpCode = toHttpStatus(error.type)
      return reply.status(httpCode).send({
        message: error.body.message,
        code: error.body.code,
        issues: error.body.issues,
      })
    }

    // 4. InfrastructureError / SystemError → log full error, capture in Sentry, sanitize response
    if (error instanceof AppError) {
      const httpCode = toHttpStatus(error.type)
      const isServiceUnavailable =
        error.type === ErrorType.SERVICE_UNAVAILABLE || error.type === ErrorType.TOO_MANY_REQUESTS

      logger.error({ err: error, cause: error.cause }, 'Infrastructure/System error occurred')

      if (env.SENTRY_DSN) {
        Sentry.captureException(error)
      }

      return reply.status(httpCode).send({
        message: isServiceUnavailable
          ? HTTP_ERRORS.SERVICE_UNAVAILABLE.message
          : HTTP_ERRORS.INTERNAL_SERVER.message,
        code: isServiceUnavailable
          ? HTTP_ERRORS.SERVICE_UNAVAILABLE.code
          : HTTP_ERRORS.INTERNAL_SERVER.code,
      })
    }

    // 5. Fastify internal errors (JWT, rate limit) → safe
    if (error.statusCode) {
      return reply.status(error.statusCode).send({ message: error.message })
    }

    // 6. Unknown / unhandled errors → log full error, capture in Sentry, sanitize response
    logger.error(error, 'Unhandled error occurred')

    if (env.SENTRY_DSN) {
      Sentry.captureException(error)
    }

    reply.status(500).send({
      message: HTTP_ERRORS.INTERNAL_SERVER.message,
      code: HTTP_ERRORS.INTERNAL_SERVER.code,
    })
  })
}

export const errorHandler = fp(errorHandlerPlugin, {
  name: 'error-handler',
})

