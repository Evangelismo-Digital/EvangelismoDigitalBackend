import { User } from '@prisma/client'
import { randomBytes } from 'crypto'
import { UserNotFoundForPasswordResetError } from '../errors/user-not-found-for-password-reset-error'
import { FailedToSendEmailError } from '../errors/failed-to-send-email-error'
import { emailSchema } from '@http/schemas/utils/email'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { SendEmailUseCase } from '../email/send-email'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { EMAIL_CONSTANTS } from 'messages/constants/email/email'
import { forgotPasswordTextTemplate } from '@templates/forgot-password/forgot-password-text'
import { forgotPasswordHtmlTemplate } from '@templates/forgot-password/forgot-password-html'

interface ForgotPasswordUseCaseRequest {
  email: string
}

type ForgotPasswordUseCaseResponse = {
  user: User
  token: string
}

const EXPIRES_IN_MINUTES = 15
const TOKEN_LENGTH = 32

export class ForgotPasswordUseCase {
  constructor(
    private usersRepository: UsersRepository,
    private sendEmailUseCase: SendEmailUseCase,
  ) {}

  async execute({ email }: ForgotPasswordUseCaseRequest): Promise<Result<ForgotPasswordUseCaseResponse, AppError>> {
    let userExists: User | null = null

    if (emailSchema.safeParse(email).success) {
      const userResult = await this.usersRepository.findBy({ email: email })

      if (isErr(userResult)) {
        return userResult
      }

      userExists = userResult.value
    }

    if (!userExists) {
      return err(new UserNotFoundForPasswordResetError())
    }

    const passwordToken = randomBytes(TOKEN_LENGTH).toString('hex')
    const tokenExpiresAt = new Date(Date.now() + EXPIRES_IN_MINUTES * 60 * 1000)

    const updateResult = await this.usersRepository.updatePassword(userExists.publicId, {
      token: passwordToken,
      tokenExpiresAt,
    })

    if (isErr(updateResult)) {
      return updateResult
    }

    const user = updateResult.value

    if (!user) {
      return err(new UserNotFoundForPasswordResetError())
    }

    // Attempt to send email
    const emailResult = await this.sendEmailUseCase.execute({
      to: user.email,
      subject: EMAIL_CONSTANTS.PASSWORD_RECOVERY_SUBJECT,
      message: forgotPasswordTextTemplate(user.name, passwordToken),
      html: forgotPasswordHtmlTemplate(user.name, passwordToken),
    })

    if (isErr(emailResult)) {
      // Invalidate/delete the token on failure
      await this.usersRepository.updatePassword(user.publicId, {
        token: null,
        tokenExpiresAt: null,
      })
      return err(new FailedToSendEmailError())
    }

    return ok({
      user,
      token: passwordToken,
    })
  }
}
