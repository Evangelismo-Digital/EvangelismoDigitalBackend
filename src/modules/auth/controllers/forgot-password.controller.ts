import { ZodRequest } from '@common/types/zod-request'
import type { FastifyReply } from 'fastify'
import { forgotPasswordSchema } from '@modules/auth/dto/forgot-password.dto'
import { makeForgotPasswordUseCase } from '@modules/auth/factories/make-forgot-password.service'
import { enqueueOutboxDispatch } from '@infra/outbox/queue/outbox-dispatch-queue'
import { EMAIL_CONSTANTS } from '@common/messages/constants/email/email'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function forgotPassword(request: ZodRequest<{ body: typeof forgotPasswordSchema }>, reply: FastifyReply) {
  const { email } = request.body

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
    void enqueueOutboxDispatch(outboxEvent)
  }

  return reply.code(HTTP_STATUS.OK).send({ message: EMAIL_CONSTANTS.PASSWORD_RESET_GENERIC_MESSAGE })
}
