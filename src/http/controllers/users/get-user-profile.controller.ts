import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@lib/logger'
import { UserPresenter } from '@http/presenters/user-presenter'
import { makeGetUserProfileUseCase } from '@use-cases/factories/make-get-user-profile-use-case'
import { publicIdSchema } from '@http/schemas/utils/public-id-schema'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

export async function getUserProfile(request: FastifyRequest, reply: FastifyReply) {
  const getUserProfileUseCase = makeGetUserProfileUseCase()

  const data = { publicId: String(request.user?.sub) }

  const { publicId } = publicIdSchema.parse(data)

  const result = await getUserProfileUseCase.execute({ publicId })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info('User profile retrieved successfully!')

  return reply.status(200).send(UserPresenter.toHTTP(user))
}

export async function getUserByPublicId(request: FastifyRequest, reply: FastifyReply) {
  const { publicId } = publicIdSchema.parse(request.params)

  const getUserProfileUseCase = makeGetUserProfileUseCase()

  const result = await getUserProfileUseCase.execute({ publicId: publicId })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info('User retrieved successfully!')

  return reply.status(200).send(UserPresenter.toHTTP(user))
}
