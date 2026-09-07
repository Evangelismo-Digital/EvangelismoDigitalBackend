import type { FastifyReply, FastifyRequest } from 'fastify'
import { forgotPasswordSchema } from '@http/schemas/users/forgot-password-schema'
import { makeForgotPasswordUseCase } from '@use-cases/factories/make-forgot-password-use-case'
import { OutboxSignal } from '@lib/infra/events/outbox-signal'
import { EMAIL_CONSTANTS } from 'messages/constants/email/email'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { HTTP_STATUS } from '@http/http-status'

export async function forgotPassword(request: FastifyRequest, reply: FastifyReply) {
  const { email } = forgotPasswordSchema.parse(request.body)

  if (!email) {
    return reply.code(HTTP_STATUS.OK).send({ message: EMAIL_CONSTANTS.PASSWORD_RESET_GENERIC_MESSAGE })
  }

  const forgotPasswordUseCase = makeForgotPasswordUseCase()

  const result = await forgotPasswordUseCase.execute({ email })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { outboxEvent } = result.value

  if (outboxEvent) {
    void OutboxSignal.publishNewItem(outboxEvent.publicId, outboxEvent)
  }

  return reply.code(HTTP_STATUS.OK).send({ message: EMAIL_CONSTANTS.PASSWORD_RESET_GENERIC_MESSAGE })
}
