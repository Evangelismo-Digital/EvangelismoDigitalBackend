import { ZodRequest } from '@common/types/zod-request'
import type { FastifyReply } from 'fastify'
import { makeResetPasswordUseCase } from '@modules/auth/factories/make-reset-password.service'
import { resetPasswordSchema } from '@modules/auth/dto/reset-password.dto'
import { logger } from '@infra/logger'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { AUTH_CONSTANTS } from '@common/messages/constants/auth/auth'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function resetPassword(request: ZodRequest<{ body: typeof resetPasswordSchema }>, reply: FastifyReply) {
  const { password, token } = request.body

  const resetPasswordUseCase = makeResetPasswordUseCase()

  const result = await resetPasswordUseCase.execute({ password, token })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info({ userId: user.publicId }, AUTH_CONSTANTS.PASSWORD_CHANGED_SUCCESS)

  return reply.code(HTTP_STATUS.OK).send({ message: AUTH_CONSTANTS.PASSWORD_CHANGED_SUCCESS })
}
