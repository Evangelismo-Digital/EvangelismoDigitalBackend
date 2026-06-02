import { emailSchema } from '@http/schemas/utils/email'
import { User } from '@prisma/client'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { InvalidCredentialsError } from '@use-cases/errors/invalid-credentials-error'
import { compare } from 'bcryptjs'
import { AuthenticationAuditUseCase } from '@use-cases/authentication-audit/authentication-audit'
import { AuthenticationStatus } from '@prisma/client'

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
    private usersRepository: UsersRepository,
    private authenticationAuditUseCase: AuthenticationAuditUseCase,
  ) {}

  async execute({
    login,
    password,
    auditContext,
  }: AuthenticateUserUseCaseRequest): Promise<AuthenticateUserUseCaseResponse> {
    let user: User | null = null

    if (emailSchema.safeParse(login).success) {
      user = await this.usersRepository.findBy({ email: login })
    } else {
      user = await this.usersRepository.findBy({ username: login })
    }

    if (!user) {
      await this.authenticationAuditUseCase.execute({
        ...auditContext,
        status: AuthenticationStatus.USER_NOT_EXISTS,
      })

      throw new InvalidCredentialsError()
    }

    const hashToCompare = user.passwordHash

    const doesPasswordMatch = await compare(password, hashToCompare)

    if (!doesPasswordMatch) {
      await this.authenticationAuditUseCase.execute({
        ...auditContext,
        status: AuthenticationStatus.INCORRECT_PASSWORD,
        userId: user.id,
      })

      throw new InvalidCredentialsError()
    }

    await this.authenticationAuditUseCase.execute({
      ...auditContext,
      status: AuthenticationStatus.SUCCESS,
      userId: user.id,
    })

    return { user }
  }
}
