import { ZodRequest } from '@common/types/zod-request'
import type { FastifyReply } from 'fastify'
import { logger } from '@infra/logger'
import { UserPresenter } from '@modules/users/presenters/user.presenter'
import { makeUpdateUserUseCase } from '@modules/users/factories/make-update-user.service'
import { updateSchema } from '@modules/users/dto/update-user.dto'
import { publicIdSchema } from '@common/dto/utils/public-id.dto'
import { AUTH_ERRORS } from '@common/messages/errors/auth'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function updateUser(request: ZodRequest<{ body: typeof updateSchema }>, reply: FastifyReply) {
  const { name, username, email } = request.body

  const authUser = request.user

  // `publicId` is the newer claim; `sub` is what older tokens carry.
  const publicId = authUser.publicId ?? authUser.sub

  if (!publicId) {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ message: AUTH_ERRORS.UNAUTHORIZED.message })
  }

  const { publicId: validatedPublicId } = publicIdSchema.parse({ publicId })

  const updateUserUseCase = makeUpdateUserUseCase()

  const result = await updateUserUseCase.execute({
    publicId: validatedPublicId,
    name,
    email,
    username,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info('Usuário atualizado com sucesso!')

  return reply.code(HTTP_STATUS.OK).send(UserPresenter.toHTTP(user))
}
