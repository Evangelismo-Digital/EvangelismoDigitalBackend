import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@lib/logger'
import { UserPresenter } from '@http/presenters/user-presenter'
import { makeUpdateUserUseCase } from '@use-cases/factories/make-update-user-use-case'
import { updateSchema } from '@http/schemas/users/update-schema'
import { publicIdSchema } from '@http/schemas/utils/public-id-schema'
import { AUTH_ERRORS } from 'messages/errors/auth'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { HTTP_STATUS } from '@http/http-status'

export async function updateUser(request: FastifyRequest, reply: FastifyReply) {
  const { name, username, email } = updateSchema.parse(request.body)

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
