import type { FastifyReply, FastifyRequest } from 'fastify'
import { AUTH_ERRORS } from 'messages/errors/auth'
import { HTTP_STATUS } from '@http/http-status'

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ message: AUTH_ERRORS.UNAUTHORIZED.message })
  }
}
