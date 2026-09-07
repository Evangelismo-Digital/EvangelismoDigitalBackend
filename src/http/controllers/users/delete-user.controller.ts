import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@lib/logger'
import { makeDeleteUserUseCase } from '@use-cases/factories/make-delete-user-use-case'
import { publicIdSchema } from '@http/schemas/utils/public-id-schema'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { HTTP_STATUS } from '@http/http-status'

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

export async function deleteUserByPublicId(request: FastifyRequest, reply: FastifyReply) {
  const { publicId } = publicIdSchema.parse(request.params)

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
