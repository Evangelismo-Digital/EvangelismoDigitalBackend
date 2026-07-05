import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import z, { ZodError } from 'zod'
import * as Sentry from '@sentry/node'
import { env } from '@env/index'
import { logger } from '@lib/logger'
import { logError } from '@lib/logger/helpers'
import { INVALID_JSON_ERROR, INTERNAL_SERVER_ERROR } from 'messages/constants/errors/http'
import { AppError } from 'errors/app-error'
import { toHttpStatus } from 'errors/http-errors/http-error-status.mapper'
import { ZodValidationError } from 'errors/http-errors/zod-validation-error'

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, _request, reply) => {
    // 1. Zod validation errors → ZodValidationError → AppError pipeline
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

    // 2. JSON parse errors
    if (error instanceof SyntaxError) {
      logger.error(error, 'JSON inválido recebido')
      return reply.status(400).send({ message: INVALID_JSON_ERROR.message })
    }

    // 3. AppError instances → HttpErrorMapper pipeline
    if (error instanceof AppError) {
      const httpCode = toHttpStatus(error.type)
      return reply.status(httpCode).send({
        message: error.body.message,
        code: error.body.code,
        issues: error.body.issues,
      })
    }

    // 4. Errors with statusCode (Fastify internal errors like JWT, rate limit)
    if (error.statusCode) {
      return reply.status(error.statusCode).send({ message: error.message })
    }

    // 5. Unknown / unhandled errors → 500
    if (env.NODE_ENV === 'development') {
      logError(error, {}, 'Unhandled error occurred')
    } else {
      if (env.SENTRY_DSN) {
        Sentry.captureException(error)
      }
      logger.error(error, 'Unhandled error occurred')
    }

    reply.status(500).send({ message: INTERNAL_SERVER_ERROR.message, error: error.message })
  })
}

export const errorHandler = fp(errorHandlerPlugin, {
  name: 'error-handler',
})
