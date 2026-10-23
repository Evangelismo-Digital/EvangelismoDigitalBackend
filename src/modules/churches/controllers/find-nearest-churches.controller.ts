import { cepSchema } from '@common/dto/utils/cep.dto'
import { logger } from '@infra/logger'
import { makeFindNearestChurchesUseCase } from '@modules/churches/factories/make-find-nearest-churches.service'
import { ChurchPresenter } from '@modules/churches/presenters/church.presenter'
import { FastifyReply } from 'fastify'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

import { ZodRequest } from '@common/types/zod-request'
import z from 'zod'

export async function findNearestChurches(
  request: ZodRequest<{ querystring: z.ZodObject<{ cep: typeof cepSchema }> }>,
  reply: FastifyReply,
) {
  const { cep } = request.query

  logger.info({
    msg: 'Cep do usuário recebido para encontrar igrejas próximas',
    ip: request.ip,
  })

  const findNearestChurchesUseCase = makeFindNearestChurchesUseCase()

  const result = await findNearestChurchesUseCase.execute({ cep, deadline: request.deadline })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const response = result.value
  const nearestChurchesInfo = ChurchPresenter.toHTTP(response.nearestChurchesInfo)

  logger.info({
    msg: 'Igrejas mais próximas encontradas com sucesso',
    nearestChurchesInfo,
  })

  return reply.code(HTTP_STATUS.OK).send({
    ...response,
    nearestChurchesInfo,
  })
}
