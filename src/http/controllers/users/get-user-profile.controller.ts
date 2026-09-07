import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@lib/logger'
import { UserPresenter } from '@http/presenters/user-presenter'
import { makeGetUserProfileUseCase } from '@use-cases/factories/make-get-user-profile-use-case'
import { publicIdSchema } from '@http/schemas/utils/public-id-schema'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { HTTP_STATUS } from '@http/http-status'

export async function getUserProfile(request: FastifyRequest, reply: FastifyReply) {
  const getUserProfileUseCase = makeGetUserProfileUseCase()

  // `request.user` is populated by the verifyJwt hook this route requires,
  // and `sub` is the one claim the payload always carries.
  const data = { publicId: request.user.sub }

  const { publicId } = publicIdSchema.parse(data)

  const result = await getUserProfileUseCase.execute({ publicId })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info('Perfil do usuário obtido com sucesso!')

  return reply.code(HTTP_STATUS.OK).send(UserPresenter.toHTTP(user))
}

export async function getUserByPublicId(request: FastifyRequest, reply: FastifyReply) {
  const { publicId } = publicIdSchema.parse(request.params)

  const getUserProfileUseCase = makeGetUserProfileUseCase()

  const result = await getUserProfileUseCase.execute({ publicId })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info('Usuário obtido com sucesso!')

  return reply.code(HTTP_STATUS.OK).send(UserPresenter.toHTTP(user))
}
