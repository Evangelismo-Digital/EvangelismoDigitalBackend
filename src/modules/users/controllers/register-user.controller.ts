import { ZodRequest } from '@common/types/zod-request'
import type { FastifyReply } from 'fastify'
import { logger } from '@infra/logger'
import { registerSchema } from '@modules/users/dto/register-user.dto'
import { makeRegisterUserUseCase } from '@modules/users/factories/make-register-user.service'
import { UserPresenter } from '@modules/users/presenters/user.presenter'
import { UserRole } from '@modules/users/repositories/users-repository.interface'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { HTTP_STATUS } from '@common/constants/http-status'

export async function register(request: ZodRequest<{ body: typeof registerSchema }>, reply: FastifyReply) {
  const { name, email, cpf, username, password } = request.body

  const registerUseCase = makeRegisterUserUseCase()

  const result = await registerUseCase.execute({
    name,
    email,
    cpf,
    password,
    username,
    role: UserRole.DEFAULT,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info({ userId: user.publicId }, 'Usuário comum registrado com sucesso!')

  return reply.code(HTTP_STATUS.CREATED).send({ user: UserPresenter.toHTTP(user) })
}

export async function registerAdmin(request: ZodRequest<{ body: typeof registerSchema }>, reply: FastifyReply) {
  const { name, email, cpf, username, password } = request.body

  const registerUseCase = makeRegisterUserUseCase()

  const result = await registerUseCase.execute({
    name,
    email,
    cpf,
    username,
    password,
    role: UserRole.ADMIN,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { user } = result.value

  logger.info({ userId: user.publicId }, 'Usuário administrador registrado com sucesso!')

  return reply.code(HTTP_STATUS.CREATED).send({ user: UserPresenter.toHTTP(user) })
}
