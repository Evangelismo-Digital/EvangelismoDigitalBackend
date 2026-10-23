import { ZodRequest } from '@common/types/zod-request'
import { FastifyReply } from 'fastify'
import { formsSchema } from '@modules/forms/dto/forms.dto'
import { makeFormSubmissionUseCase } from '@modules/forms/factories/make-form-submission.service'
import { logger } from '@infra/logger'
import { enqueueOutboxDispatch } from '@infra/outbox/queue/outbox-dispatch-queue'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function formSubmission(request: ZodRequest<{ body: typeof formsSchema }>, reply: FastifyReply) {
  // 1. Validação de Entrada (Zod)
  const data = request.body

  // 2. Fábrica (Cria o Use Case com o Decorator Transacional)
  const formSubmissionUseCase = makeFormSubmissionUseCase()

  // 3. Execução
  const result = await formSubmissionUseCase.execute({
    ...data,
    ipAddress: request.ip,
  })

  // 4. Tratamento de erro (HTTP Errors)
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  // 5. Sucesso
  const { sanitizedFormSubmission, outboxEvent } = result.value

  // Fire-and-forget: enqueueOutboxDispatch catches and logs its own failures internally.
  void enqueueOutboxDispatch(outboxEvent)

  logger.info({ sanitizedFormSubmission }, 'Formulário recebido com sucesso')

  return reply.code(HTTP_STATUS.CREATED).send({
    sanitizedFormSubmission,
  })
}
