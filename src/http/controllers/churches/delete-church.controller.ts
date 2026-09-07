import { deleteChurchBodySchema } from '@http/schemas/churches/delete-church-schema'
import { ChurchPresenter } from '@http/presenters/church-presenter'
import { logger } from '@lib/logger'
import { makeDeleteChurchUseCase } from '@use-cases/factories/make-delete-church-use-case'
import { FastifyReply, FastifyRequest } from 'fastify'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { HTTP_STATUS } from '@http/http-status'

export async function deleteChurch(request: FastifyRequest, reply: FastifyReply) {
  const { publicId } = deleteChurchBodySchema.parse(request.body)

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
