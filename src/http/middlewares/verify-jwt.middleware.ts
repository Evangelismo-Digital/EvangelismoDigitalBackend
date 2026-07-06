import type { FastifyReply, FastifyRequest } from 'fastify'
import { AUTH_ERRORS } from 'messages/errors/auth'

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ message: AUTH_ERRORS.UNAUTHORIZED.message })
  }
}
