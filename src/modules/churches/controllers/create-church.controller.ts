import { ZodRequest } from '@common/types/zod-request'
import { createChurchBodySchema } from '@modules/churches/dto/create-church.dto'
import { ChurchPresenter } from '@modules/churches/presenters/church.presenter'
import { logger } from '@infra/logger'
import { makeCreateChurchUseCase } from '@modules/churches/factories/make-create-church.service'
import { FastifyReply } from 'fastify'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function createChurch(request: ZodRequest<{ body: typeof createChurchBodySchema }>, reply: FastifyReply) {
  const { name, address, lat, lon } = request.body

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
    return HttpErrorMapper.map(result.error, reply)
  }

  const sanitizedChurch = ChurchPresenter.toHTTP(result.value)

  logger.info({
    msg: 'Igreja criada com sucesso',
    church: sanitizedChurch,
  })

  return reply.code(HTTP_STATUS.CREATED).send({ church: sanitizedChurch })
}
