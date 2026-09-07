import type { FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '@lib/logger'
import { registerSchema } from '@http/schemas/users/register-schema'
import { makeRegisterUserUseCase } from '@use-cases/factories/make-register-user-use-case'
import { UserPresenter } from '@http/presenters/user-presenter'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { HTTP_STATUS } from '@http/http-status'

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const { name, email, cpf, username, password } = registerSchema.parse(request.body)

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

export async function registerAdmin(request: FastifyRequest, reply: FastifyReply) {
  const { name, email, cpf, username, password } = registerSchema.parse(request.body)

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
