import { ZodRequest } from '@common/types/zod-request'
import { logger } from '@infra/logger'
import { makeSearchUsersUseCase } from '@modules/users/factories/make-search-users.service'
import { FastifyReply } from 'fastify'
import { UserPresenter } from '@modules/users/presenters/user.presenter'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { searchUsersSchema } from '@modules/users/dto/search-users.dto'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function searchUsersController(
  request: ZodRequest<{ querystring: typeof searchUsersSchema }>,
  reply: FastifyReply,
) {
  const { query, page } = request.query

  const searchUsersUseCase = makeSearchUsersUseCase()

  const result = await searchUsersUseCase.execute({
    query,
    page,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { users } = result.value

  logger.info(`Encontrados ${users.length} usuários para a consulta: "${query}" na página ${page}.`)

  return reply.code(HTTP_STATUS.OK).send({ users: UserPresenter.toHTTP(users) })
}
