import { logger } from '@lib/logger'
import { makeSearchUsersUseCase } from '@use-cases/factories/make-search-users-use-case'
import { FastifyReply, FastifyRequest } from 'fastify'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

export async function searchUsersController(request: FastifyRequest, reply: FastifyReply) {
  const { query, page } = request.query as { query: string; page: string }

  const searchQuery = query || ''
  const pageNumber = page ? parseInt(page, 10) : 1

  if (isNaN(pageNumber) || pageNumber < 1) {
    return reply
      .status(400)
      .send({ message: 'Número de página inválido. A página deve ser um número inteiro maior que zero.' })
  }

  const searchUsersUseCase = makeSearchUsersUseCase()

  const result = await searchUsersUseCase.execute({
    query: searchQuery,
    page: pageNumber,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { users } = result.value

  logger.info(`Encontrados ${users.length} usuários para a consulta: "${searchQuery}" na página ${pageNumber}.`)

  return reply.status(200).send({ users })
}
