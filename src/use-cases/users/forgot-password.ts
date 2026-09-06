import { randomBytes } from 'node:crypto'
import { emailSchema } from '@http/schemas/utils/email'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { IOutboxEventRegistration } from 'core/contracts/use-cases/outbox-event/outbox-event.interface'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import { OUTBOX_EVENT_TYPES } from 'core/types/outbox/outbox-event-input'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { PASSWORD_RESET_CONSTANTS } from 'messages/constants/auth/password-reset'
import { hashResetToken } from './helpers/token-hash'

interface ForgotPasswordUseCaseRequest {
  email: string
}

type ForgotPasswordUseCaseResponse = {
  outboxEvent: IOutboxEvent | null
}

export class ForgotPasswordUseCase {
  constructor(
    private usersRepository: UsersRepository,
    private eventRegistration: IOutboxEventRegistration,
  ) {}

  async execute({ email }: ForgotPasswordUseCaseRequest): Promise<Result<ForgotPasswordUseCaseResponse, AppError>> {
    if (!emailSchema.safeParse(email).success) {
      return ok({ outboxEvent: null })
    }

    const userResult = await this.usersRepository.findBy({ email })

    if (isErr(userResult)) {
      return userResult
    }

    const user = userResult.value

    if (!user) {
      return ok({ outboxEvent: null })
    }

    const rawToken = randomBytes(PASSWORD_RESET_CONSTANTS.TOKEN_LENGTH_BYTES).toString('hex')
    const tokenExpiresAt = new Date(Date.now() + PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES * 60 * 1000)

    // Grava apenas o hash; o token cru segue só no payload transitório da outbox
    const updateResult = await this.usersRepository.updatePassword(user.publicId, {
      token: hashResetToken(rawToken),
      tokenExpiresAt,
    })

    if (isErr(updateResult)) {
      return updateResult
    }

    return await this.registerResetEvent(user, rawToken, tokenExpiresAt)
  }

  /**
   * Same transaction as the token write (TransactionalUseCaseDecorator): either
   * the token and the event both exist, or neither does — no compensation step.
   */
  private async registerResetEvent(
    user: { publicId: string; name: string; email: string },
    rawToken: string,
    tokenExpiresAt: Date,
  ): Promise<Result<ForgotPasswordUseCaseResponse, AppError>> {
    const outboxEvent = await this.eventRegistration.register({
      type: OUTBOX_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
      payload: {
        userPublicId: user.publicId,
        name: user.name,
        email: user.email,
        token: rawToken,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
      },
      expiresAt: tokenExpiresAt,
    })

    if (isErr(outboxEvent)) {
      return outboxEvent
    }

    return ok({ outboxEvent: outboxEvent.value })
  }
}
