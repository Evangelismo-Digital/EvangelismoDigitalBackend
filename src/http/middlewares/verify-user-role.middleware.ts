import { type FastifyReply, type FastifyRequest } from 'fastify'
import { UserRole } from '@prisma/client'
import { AUTH_ERRORS } from 'messages/errors/auth'

export function verifyUserRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user

    if (!role) {
      return reply.code(401).send({ message: AUTH_ERRORS.UNAUTHORIZED.message })
    }

    if (!allowedRoles.includes(role)) {
      return reply.code(403).send({ message: AUTH_ERRORS.FORBIDDEN.message })
    }
  }
}
