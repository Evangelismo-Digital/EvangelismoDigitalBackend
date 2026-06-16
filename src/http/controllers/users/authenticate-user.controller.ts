import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthenticationStatus } from '@prisma/client'
import { logger } from '@lib/logger'
import { authenticateSchema } from '@http/schemas/users/authenticate-schema'
import { makeAuthenticateUserUseCase } from '@use-cases/factories/make-authenticate-user-use-case'
import { makeAuthenticationAuditUseCase } from '@use-cases/factories/make-authentication-audit-use-case'
import { UserPresenter } from '@http/presenters/user-presenter'
import { messages } from 'core/constants/messages'
import { z } from 'zod'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

function getAuthenticationAuditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    remotePort: request.socket.remotePort?.toString() ?? null,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
    origin: typeof request.headers.origin === 'string' ? request.headers.origin : null,
  }
}

export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  const authenticationAuditUseCase = makeAuthenticationAuditUseCase()

  const auditContext = getAuthenticationAuditContext(request)

  const parsedBody = authenticateSchema.safeParse(request.body)

  if (!parsedBody.success) {
    await authenticationAuditUseCase.execute({
      ...auditContext,
      status: AuthenticationStatus.INVALID_REQUEST,
    })

    return reply
      .status(400)
      .send({ message: messages.validation.invalidData, details: z.treeifyError(parsedBody.error) })
  }

  const authenticateUserUseCase = makeAuthenticateUserUseCase()

  const result = await authenticateUserUseCase.execute({
    login: parsedBody.data.login,
    password: parsedBody.data.password,
    auditContext,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info('User authenticated successfully!')

  const token = await reply.jwtSign({ sub: user.publicId, role: user.role }, { expiresIn: '1d' })

  return reply.status(200).send({ token, user: UserPresenter.toHTTP(user) })
}
