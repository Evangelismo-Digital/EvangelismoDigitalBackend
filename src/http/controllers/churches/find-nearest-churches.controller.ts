import { cepSchema } from '@http/schemas/utils/cep'
import { logger } from '@lib/logger'
import { makeFindNearestChurchesUseCase } from '@use-cases/factories/make-find-nearest-churches-use-case'
import { FastifyReply, FastifyRequest } from 'fastify'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { HTTP_STATUS } from '@http/http-status'

export async function findNearestChurches(
  request: FastifyRequest<{ Querystring: { cep: string } }>,
  reply: FastifyReply,
) {
  const cep = cepSchema.parse(request.query.cep)

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

  logger.info({
    msg: 'Igrejas mais próximas encontradas com sucesso',
    nearestChurchesInfo: response.nearestChurchesInfo,
  })

  return reply.code(HTTP_STATUS.OK).send(response)
}
