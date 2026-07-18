import { findChurchByNameSchema } from '@http/schemas/churches/find-church-by-name-schema'
import { makeFindChurchPublicIdByNameUseCase } from '@use-cases/factories/make-find-church-publicId-by-name-use-case'
import { FastifyReply, FastifyRequest } from 'fastify'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

export async function findChurchPublicIdByName(request: FastifyRequest, reply: FastifyReply) {
  const { name } = findChurchByNameSchema.parse(request.body)

  const findChurchPublicIdByNameUseCase = makeFindChurchPublicIdByNameUseCase()

  const result = await findChurchPublicIdByNameUseCase.execute({ name })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.code(200).send({ publicId: result.value.publicId })
}
