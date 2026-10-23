import { ZodRequest } from '@common/types/zod-request'
import { findChurchByNameSchema } from '@modules/churches/dto/find-church-by-name.dto'
import { makeFindChurchPublicIdByNameUseCase } from '@modules/churches/factories/make-find-church-publicId-by-name.service'
import { FastifyReply } from 'fastify'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

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
