import { FastifyReply } from 'fastify'
import { DomainError } from '../domain-error'
import { toHttpStatus } from './http-error-status.mapper'

export class HttpErrorMapper {
  static map(error: Error, reply: FastifyReply) {
    if (reply.sent) {
      throw error
    }

    if (error instanceof DomainError) {
      const httpCode = toHttpStatus(error.type)
      return reply.code(httpCode).send({
        message: error.body.message,
        code: error.body.code,
        issues: error.body.issues,
      })
    }

    // InfrastructureError, SystemError, and unknown errors are rethrown
    // to reach the global Fastify error handler for sanitization
    throw error
  }
}
