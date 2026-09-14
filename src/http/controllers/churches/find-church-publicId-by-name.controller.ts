import { ZodRequest } from '@http/types/zod-request'
import { findChurchByNameSchema } from '@http/schemas/churches/find-church-by-name-schema'
import { makeFindChurchPublicIdByNameUseCase } from '@use-cases/factories/make-find-church-publicId-by-name-use-case'
import { FastifyReply } from 'fastify'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { HTTP_STATUS } from '@http/http-status'

export async function findChurchPublicIdByName(
  request: ZodRequest<{ body: typeof findChurchByNameSchema }>,
  reply: FastifyReply,
) {
  const { name } = request.body

  const findChurchPublicIdByNameUseCase = makeFindChurchPublicIdByNameUseCase()

  const result = await findChurchPublicIdByNameUseCase.execute({ name })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.code(HTTP_STATUS.OK).send({ publicId: result.value.publicId })
}
