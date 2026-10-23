import { ZodRequest } from '@common/types/zod-request'
import type { FastifyReply } from 'fastify'
import { logger } from '@infra/logger'
import { authenticateSchema } from '@modules/auth/dto/authenticate.dto'
import { makeAuthenticateUserUseCase } from '@modules/auth/factories/make-authenticate-user.service'
import { UserPresenter } from '@modules/users/presenters/user.presenter'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

function getAuthenticationAuditContext(request: ZodRequest<{ body: typeof authenticateSchema }>) {
  return {
    ipAddress: request.ip,
    remotePort: request.socket.remotePort?.toString() ?? null,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
    origin: typeof request.headers.origin === 'string' ? request.headers.origin : null,
  }
}

export async function authenticateUser(request: ZodRequest<{ body: typeof authenticateSchema }>, reply: FastifyReply) {
  const { login, password } = request.body

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

  return reply.code(HTTP_STATUS.OK).send({ token, user: UserPresenter.toHTTP(user) })
}
