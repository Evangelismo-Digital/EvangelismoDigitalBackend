import { PrismaUsersRepository } from '@repositories/prisma/prisma-users-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@repositories/prisma/errors/users-error-mapping'
import { ForgotPasswordUseCase } from '@use-cases/users/forgot-password'
import { makeSendEmailUseCase } from '@use-cases/factories/make-send-email-use-case'

export function makeForgotPasswordUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  const sendEmailUseCase = makeSendEmailUseCase()
  const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository, sendEmailUseCase)

  return forgotPasswordUseCase
}
