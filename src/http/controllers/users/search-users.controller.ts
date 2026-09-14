import { ZodRequest } from '@http/types/zod-request'
import { logger } from '@lib/logger'
import { makeSearchUsersUseCase } from '@use-cases/factories/make-search-users-use-case'
import { FastifyReply } from 'fastify'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { searchUsersSchema } from '@http/schemas/users/search-users-schema'
import { HTTP_STATUS } from '@http/http-status'

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

  return reply.code(HTTP_STATUS.OK).send({ users })
}
