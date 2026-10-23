import { ZodRequest } from '@common/types/zod-request'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@infra/logger'
import { makeDeleteUserUseCase } from '@modules/users/factories/make-delete-user.service'
import { publicIdSchema } from '@common/dto/utils/public-id.dto'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function deleteUser(request: FastifyRequest, reply: FastifyReply) {
  const deleteUserUseCase = makeDeleteUserUseCase()

  const result = await deleteUserUseCase.execute({
    publicId: request.user.sub,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  logger.info('Usuário deletado com sucesso!')

  return reply.code(HTTP_STATUS.NO_CONTENT).send()
}

export async function deleteUserByPublicId(
  request: ZodRequest<{ params: typeof publicIdSchema }>,
  reply: FastifyReply,
) {
  const { publicId } = request.params

  const deleteUserUseCase = makeDeleteUserUseCase()

  const result = await deleteUserUseCase.execute({
    publicId,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  logger.info({ targetId: publicId }, 'Usuário deletado com sucesso!')

  return reply.code(HTTP_STATUS.NO_CONTENT).send()
}
