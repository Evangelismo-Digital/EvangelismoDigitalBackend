import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthenticationStatus } from '@prisma/client'
import { logger } from '@lib/logger'
import { authenticateSchema } from '@http/schemas/users/authenticate-schema'
import { InvalidCredentialsError } from '@use-cases/errors/invalid-credentials-error'
import { makeAuthenticateUserUseCase } from '@use-cases/factories/make-authenticate-user-use-case'
import { makeAuthenticationAuditUseCase } from '@use-cases/factories/make-authentication-audit-use-case'
import { UserPresenter } from '@http/presenters/user-presenter'
import { messages } from 'core/constants/messages'
import { z } from 'zod'

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

    return reply.status(400).send({ message: messages.validation.invalidData, details: z.treeifyError(parsedBody.error) })
  }

  try {
    const authenticateUserUseCase = makeAuthenticateUserUseCase()

    const { user } = await authenticateUserUseCase.execute({
      login: parsedBody.data.login,
      password: parsedBody.data.password,
      auditContext,
    })

    logger.info('User authenticated successfully!')

    const token = await reply.jwtSign({ sub: user.publicId, role: user.role }, { expiresIn: '1d' })

    return reply.status(200).send({ token, user: UserPresenter.toHTTP(user) })
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return reply.status(400).send({ message: error.message })
    }

    throw error
  }
}