import { FastifyReply } from 'fastify'
import { AppError } from '../app-error'
import { toHttpStatus } from './http-error-status.mapper'

export class HttpErrorMapper {
  static map(error: Error, reply: FastifyReply) {
    if (error instanceof AppError) {
      const httpCode = toHttpStatus(error.type)
      return reply.status(httpCode).send({
        message: error.body.message,
        code: error.body.code,
        issues: error.body.issues,
      })
    }

    // Handle unknown errors
    throw error
  }
}
