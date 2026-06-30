import type { FastifyReply, FastifyRequest } from 'fastify'
import { forgotPasswordSchema } from '@http/schemas/users/forgot-password-schema'
import { makeForgotPasswordUseCase } from '@use-cases/factories/make-forgot-password-use-case'
import { logger } from '@lib/logger'
import { makeSendEmailUseCase } from '@use-cases/factories/make-send-email-use-case'
import { forgotPasswordTextTemplate } from '@templates/forgot-password/forgot-password-text'
import { forgotPasswordHtmlTemplate } from '@templates/forgot-password/forgot-password-html'
import { messages } from 'core/constants/messages'
import { UserNotFoundForPasswordResetError } from '@use-cases/errors/user-not-found-for-password-reset-error'
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
    if (result.error instanceof UserNotFoundForPasswordResetError) {
      return reply.status(200).send({ message: result.error.message })
    }
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user, token } = result.value

  const sendEmailUseCase = makeSendEmailUseCase()

  const emailResult = await sendEmailUseCase.execute({
    to: user.email,
    subject: messages.email.passwordRecoverySubject,
    message: forgotPasswordTextTemplate(user.name, token),
    html: forgotPasswordHtmlTemplate(user.name, token),
  })

  if (isErr(emailResult)) {
    logger.error({ targetId: user.publicId, error: emailResult.error.message }, 'Failed to send password reset email')
  } else {
    logger.info({ targetId: user.publicId }, 'Password reset email sent')
  }

  return reply.status(200).send({ message: messages.info.passwordResetGeneric })
}
