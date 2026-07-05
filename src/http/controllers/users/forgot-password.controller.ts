import type { FastifyReply, FastifyRequest } from 'fastify'
import { forgotPasswordSchema } from '@http/schemas/users/forgot-password-schema'
import { makeForgotPasswordUseCase } from '@use-cases/factories/make-forgot-password-use-case'
import { messages } from 'messages/constants/messages'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

export async function forgotPassword(request: FastifyRequest, reply: FastifyReply) {
  const { email } = forgotPasswordSchema.parse(request.body)

  if (!email) {
    return reply.status(200).send({ message: messages.info.passwordResetGeneric })
  }

  const forgotPasswordUseCase = makeForgotPasswordUseCase()

  const result = await forgotPasswordUseCase.execute({ email })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.status(200).send({ message: messages.info.passwordResetGeneric })
}
