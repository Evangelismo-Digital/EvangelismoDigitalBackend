import { FastifyReply, FastifyRequest } from 'fastify'
import { formsSchema } from '@http/schemas/forms/forms-schema'
import { makeFormSubmissionUseCase } from '@use-cases/forms/factories/make-form-submission-use-case'
import { logger } from '@lib/logger'
import { OutboxSignal } from '@lib/infra/events/outbox-signal'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

export async function formSubmission(request: FastifyRequest, reply: FastifyReply) {
  // 1. Validação de Entrada (Zod)
  const data = formsSchema.parse(request.body)

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

  // Fire-and-forget: publishNewItem catches and logs its own failures internally.
  void OutboxSignal.publishNewItem(outboxEvent.publicId, outboxEvent)

  logger.info({ sanitizedFormSubmission }, 'Formulário recebido com sucesso')

  return reply.code(201).send({
    sanitizedFormSubmission,
  })
}
