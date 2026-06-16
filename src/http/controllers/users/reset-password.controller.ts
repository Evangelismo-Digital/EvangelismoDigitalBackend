import type { FastifyReply, FastifyRequest } from 'fastify'
import { makeResetPasswordUseCase } from '@use-cases/factories/make-reset-password-use-case'
import { resetPasswordSchema } from '@http/schemas/users/reset-password-schema'
import { logger } from '@lib/logger'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

export async function resetPassword(request: FastifyRequest, reply: FastifyReply) {
  const { password, token } = resetPasswordSchema.parse(request.body)

  const resetPasswordUseCase = makeResetPasswordUseCase()

  const result = await resetPasswordUseCase.execute({ password, token })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info({ userId: user.id }, 'Password changed successfully!')

  return reply.status(200).send({ message: 'Password changed successfully!' })
}
