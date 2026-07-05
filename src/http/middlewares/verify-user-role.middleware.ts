import { type FastifyReply, type FastifyRequest } from 'fastify'
import { UserRole } from '@prisma/client'
import { messages } from 'messages/constants/messages'

export function verifyUserRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user

    if (!role) {
      return reply.status(401).send({ message: messages.errors.unauthorized ?? 'Unauthorized' })
    }

    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({ message: messages.errors.forbidden ?? 'Forbidden' })
    }
  }
}
