import { ZodRequest } from '@common/types/zod-request'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@infra/logger'
import { UserPresenter } from '@modules/users/presenters/user.presenter'
import { makeGetUserProfileUseCase } from '@modules/users/factories/make-get-user-profile.service'
import { publicIdSchema } from '@common/dto/utils/public-id.dto'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

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

export async function getUserByPublicId(request: ZodRequest<{ params: typeof publicIdSchema }>, reply: FastifyReply) {
  const { publicId } = request.params

  const getUserProfileUseCase = makeGetUserProfileUseCase()

  const result = await getUserProfileUseCase.execute({ publicId })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info('Usuário obtido com sucesso!')

  return reply.code(HTTP_STATUS.OK).send(UserPresenter.toHTTP(user))
}
