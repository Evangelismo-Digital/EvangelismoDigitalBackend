import { type FastifyReply, type FastifyRequest } from 'fastify'
import { UserRole } from '@prisma/client'
import { UNAUTHORIZED_ERROR, FORBIDDEN_ERROR } from 'messages/constants/errors/http'

export function verifyUserRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user

    if (!role) {
      return reply.status(401).send({ message: UNAUTHORIZED_ERROR.message })
    }

    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({ message: FORBIDDEN_ERROR.message })
    }
  }
}
