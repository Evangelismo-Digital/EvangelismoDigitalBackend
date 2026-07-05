import type { FastifyReply, FastifyRequest } from 'fastify'
import { UNAUTHORIZED_ERROR } from 'messages/errors/use-cases/users/users-error-messages'

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ message: UNAUTHORIZED_ERROR.message })
  }
}
