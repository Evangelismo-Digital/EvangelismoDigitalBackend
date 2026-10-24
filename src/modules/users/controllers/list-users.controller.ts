import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@infra/logger'
import { makeListUsersUseCase } from '@modules/users/factories/make-list-users.service'
import { UserPresenter } from '@modules/users/presenters/user.presenter'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function listUsers(_request: FastifyRequest, reply: FastifyReply) {
  const listUsersUseCase = makeListUsersUseCase()

  const result = await listUsersUseCase.execute()

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { users } = result.value

  logger.info('Usuários obtidos com sucesso!')

  return reply.code(HTTP_STATUS.OK).send({ users: UserPresenter.toHTTP(users) })
}
