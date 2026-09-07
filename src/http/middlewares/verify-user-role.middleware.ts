import { type FastifyReply, type FastifyRequest } from 'fastify'
import { UserRole } from '@prisma/client'
import { AUTH_ERRORS } from 'messages/errors/auth'
import { HTTP_STATUS } from '@http/http-status'

export function verifyUserRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user

    if (!role) {
      return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ message: AUTH_ERRORS.UNAUTHORIZED.message })
    }

    if (!allowedRoles.includes(role)) {
      return reply.code(HTTP_STATUS.FORBIDDEN).send({ message: AUTH_ERRORS.FORBIDDEN.message })
    }
  }
}
