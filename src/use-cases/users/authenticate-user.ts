import { emailSchema } from 'core/validation/email'
import { User, AuthenticationStatus } from '@prisma/client'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { InvalidCredentialsError } from '@use-cases/errors/invalid-credentials-error'
import { compare } from 'bcryptjs'
import { AuthenticationAuditUseCase } from '@use-cases/authentication-audit/authentication-audit'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface AuthenticationAuditContext {
  ipAddress: string
  remotePort: string | null
  userAgent: string | null
  origin: string | null
}

interface AuthenticateUserUseCaseRequest {
  login: string
  password: string
  auditContext: AuthenticationAuditContext
}

type AuthenticateUserUseCaseResponse = {
  user: User
}

export class AuthenticateUserUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authenticationAuditUseCase: AuthenticationAuditUseCase,
  ) {}

  async execute({
    login,
    password,
    auditContext,
  }: AuthenticateUserUseCaseRequest): Promise<Result<AuthenticateUserUseCaseResponse, AppError>> {
    const userResult = await this.findByLogin(login)

    if (isErr(userResult)) {
      return userResult
    }

    const user = userResult.value

    if (!user) {
      return await this.auditAndReject({ ...auditContext, status: AuthenticationStatus.USER_NOT_EXISTS })
    }

    const doesPasswordMatch = await compare(password, user.passwordHash)

    if (!doesPasswordMatch) {
      return await this.auditAndReject({
        ...auditContext,
        status: AuthenticationStatus.INCORRECT_PASSWORD,
        userId: user.id,
      })
    }

    await this.authenticationAuditUseCase.execute({
      ...auditContext,
      status: AuthenticationStatus.SUCCESS,
      userId: user.id,
    })

    return ok({ user })
  }

  /** The login field is either an email or a username; nothing else differs. */
  private async findByLogin(login: string): Promise<Result<User | null, AppError>> {
    return emailSchema.safeParse(login).success
      ? await this.usersRepository.findBy({ email: login })
      : await this.usersRepository.findBy({ username: login })
  }

  /**
   * Every rejection is audited and then reported identically — deliberately, so
   * a wrong password and an unknown user are indistinguishable to the caller.
   */
  private async auditAndReject(
    audit: Parameters<AuthenticationAuditUseCase['execute']>[0],
  ): Promise<Result<AuthenticateUserUseCaseResponse, AppError>> {
    await this.authenticationAuditUseCase.execute(audit)

    return err(new InvalidCredentialsError())
  }
}
