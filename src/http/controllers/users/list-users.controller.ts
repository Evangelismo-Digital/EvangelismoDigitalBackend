import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@lib/logger'
import { makeListUsersUseCase } from '@use-cases/factories/make-list-users-use-case'
import { UserPresenter } from '@http/presenters/user-presenter'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

export async function listUsers(_request: FastifyRequest, reply: FastifyReply) {
  const listUsersUseCase = makeListUsersUseCase()

  const result = await listUsersUseCase.execute()

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { users } = result.value

  logger.info('Usuários obtidos com sucesso!')

  return reply.status(200).send({ users: UserPresenter.toHTTP(users) })
}
