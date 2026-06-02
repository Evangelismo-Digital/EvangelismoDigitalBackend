import { createChurchBodySchema } from '@http/schemas/churches/create-church-schema'
import { ChurchPresenter } from '@http/presenters/church-presenter'
import { logger } from '@lib/logger'
import { makeCreateChurchUseCase } from '@use-cases/factories/make-create-church-use-case'
import { FastifyReply, FastifyRequest } from 'fastify'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

export async function createChurch(request: FastifyRequest, reply: FastifyReply) {
  const { name, address, lat, lon } = createChurchBodySchema.parse(request.body)

  logger.info({
    msg: 'Criando uma nova igreja',
  })

  const createChurchUseCase = makeCreateChurchUseCase()

  const result = await createChurchUseCase.execute({
    name,
    address,
    lat,
    lon,
  })

  if (isErr(result)) {
    logger.warn({
      msg: 'Falha ao criar a igreja',
      error: result.error.message,
    })
    return HttpErrorMapper.map(result.error, reply)
  }

  const sanitizedChurch = ChurchPresenter.toHTTP(result.value)

  logger.info({
    msg: 'Igreja criada com sucesso',
    church: sanitizedChurch,
  })

  return reply.status(201).send({ church: sanitizedChurch })
}
