import { ZodRequest } from '@common/types/zod-request'
import { deleteChurchBodySchema } from '@modules/churches/dto/delete-church.dto'
import { ChurchPresenter } from '@modules/churches/presenters/church.presenter'
import { logger } from '@infra/logger'
import { makeDeleteChurchUseCase } from '@modules/churches/factories/make-delete-church.service'
import { FastifyReply } from 'fastify'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function deleteChurch(request: ZodRequest<{ body: typeof deleteChurchBodySchema }>, reply: FastifyReply) {
  const { publicId } = request.body

  logger.info({
    msg: 'Deletando uma igreja',
  })

  const deleteChurchUseCase = makeDeleteChurchUseCase()

  const result = await deleteChurchUseCase.execute({
    publicId,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const sanitizedChurch = ChurchPresenter.toHTTP(result.value.church)

  logger.info({
    msg: 'Igreja deletada com sucesso',
    church: sanitizedChurch,
  })

  return reply.code(HTTP_STATUS.OK).send({ church: sanitizedChurch })
}
