import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@lib/logger'
import { authenticateSchema } from '@http/schemas/users/authenticate-schema'
import { makeAuthenticateUserUseCase } from '@use-cases/factories/make-authenticate-user-use-case'
import { UserPresenter } from '@http/presenters/user-presenter'
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
  const { login, password } = authenticateSchema.parse(request.body)

  const auditContext = getAuthenticationAuditContext(request)

  const authenticateUserUseCase = makeAuthenticateUserUseCase()

  const result = await authenticateUserUseCase.execute({
    login,
    password,
    auditContext,
  })

  if (isErr(result)) {
    logger.warn({ login, ip: request.ip }, 'Tentativa de login falhou')
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info('Usuário autenticado com sucesso!')

  const token = await reply.jwtSign({ sub: user.publicId, role: user.role }, { expiresIn: '1d' })

  return reply.status(200).send({ token, user: UserPresenter.toHTTP(user) })
}
