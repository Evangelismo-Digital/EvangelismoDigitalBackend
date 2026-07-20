import { User } from '@prisma/client'
import { hash } from 'bcryptjs'
import { InvalidTokenError } from '../errors/invalid-token-error'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { env } from '@env/index'
import { logger } from '@lib/logger'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { hashResetToken } from './helpers/token-hash'

interface ResetPasswordUseCaseCaseRequest {
  token: string
  password: string
}

type ResetPasswordUseCaseCaseResponse = {
  user: User
}

export class ResetPasswordUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute({
    token,
    password,
  }: ResetPasswordUseCaseCaseRequest): Promise<Result<ResetPasswordUseCaseCaseResponse, AppError>> {
    // O banco guarda apenas o hash do token; o link do e-mail carrega o token cru
    const userResult = await this.usersRepository.findByToken({ token: hashResetToken(token) })

    if (isErr(userResult)) {
      return userResult
    }

    const userExists = userResult.value

    if (!userExists) {
      return err(new InvalidTokenError())
    }

    if (!userExists.tokenExpiresAt || userExists.tokenExpiresAt < new Date()) {
      // Higiene preguiçosa: token expirado é limpo na primeira tentativa de uso,
      // em vez de permanecer no banco até o próximo pedido de reset. Best-effort:
      // a falha da limpeza nunca mascara o InvalidTokenError.
      const cleanupResult = await this.usersRepository.updatePassword(userExists.publicId, {
        token: null,
        tokenExpiresAt: null,
      })

      if (isErr(cleanupResult)) {
        logger.error(
          { publicId: userExists.publicId, error: cleanupResult.error },
          'Falha ao limpar token de reset expirado; o token permanece inválido e expira naturalmente',
        )
      }

      return err(new InvalidTokenError())
    }

    const passwordHash = await hash(password, env.HASH_SALT_ROUNDS)

    const updateResult = await this.usersRepository.updatePassword(userExists.publicId, {
      passwordHash: passwordHash,
      passwordChangedAt: new Date(),
      token: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    })

    if (isErr(updateResult)) {
      return updateResult
    }

    const user = updateResult.value

    return ok({ user })
  }
}
