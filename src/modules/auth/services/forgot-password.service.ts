import { randomBytes } from 'node:crypto'
import { emailSchema } from '@common/utils/email'
import { UsersRepository } from '@modules/users/repositories/users-repository.interface'
import { IOutboxEventRegistration } from '@infra/outbox/interfaces/outbox-event.interface'
import { IOutboxEvent } from '@infra/outbox/repositories/outbox-repository.interface'
import { OUTBOX_EVENT_TYPES } from '@infra/outbox/interfaces/outbox-event-input'
import { Result, ok, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import { PASSWORD_RESET_CONSTANTS } from '@common/messages/constants/auth/password-reset'
import { hashResetToken } from '../helpers/token-hash'
import ms from 'ms'

interface ForgotPasswordUseCaseRequest {
  email: string
}

type ForgotPasswordUseCaseResponse = {
  outboxEvent: IOutboxEvent | null
}

export class ForgotPasswordUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly eventRegistration: IOutboxEventRegistration,
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
    const tokenExpiresAt = new Date(Date.now() + ms(`${PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES}m`))

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
