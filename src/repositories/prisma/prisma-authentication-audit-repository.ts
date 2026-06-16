import { prisma } from '@lib/prisma'
import { AuthenticationAudit } from '@prisma/client'
import {
  AuthenticationAuditInput,
  AuthenticationAuditRepository,
} from 'core/contracts/repository/authentication-audit-repository.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'

export class PrismaAuthenticationAuditRepository implements AuthenticationAuditRepository {
  async create(data: AuthenticationAuditInput): Promise<Result<AuthenticationAudit, AppError>> {
    try {
      const audit = await prisma.authenticationAudit.create({
        data: {
          status: data.status,
          userId: data.userId ?? null,
          ipAddress: data.ipAddress ?? null,
          remotePort: data.remotePort ?? null,
          userAgent: data.userAgent ?? null,
          origin: data.origin ?? null,
        },
      })
      return ok(audit)
    } catch (error) {
      return errOf(new DatabaseQueryError(error))
    }
  }
}
