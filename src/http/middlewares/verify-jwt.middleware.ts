import type { FastifyReply, FastifyRequest } from 'fastify'
import { messages } from 'messages/constants/messages'

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ message: messages.errors.unauthorized ?? 'Unauthorized' })
  }
}
