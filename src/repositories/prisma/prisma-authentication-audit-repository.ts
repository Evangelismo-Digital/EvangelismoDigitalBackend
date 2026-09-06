import { prisma } from '@lib/prisma'
import { AuthenticationAudit } from '@prisma/client'
import {
  AuthenticationAuditInput,
  AuthenticationAuditRepository,
} from 'core/contracts/repository/authentication-audit-repository.interface'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'

export class PrismaAuthenticationAuditRepository implements AuthenticationAuditRepository {
  async create(data: AuthenticationAuditInput): Promise<Result<AuthenticationAudit, AppError>> {
    try {
      const audit = await prisma.authenticationAudit.create({ data: toAuditRow(data) })
      return ok(audit)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }
}

/** Every optional field is stored as an explicit NULL rather than left absent. */
function toAuditRow(data: AuthenticationAuditInput) {
  return {
    status: data.status,
    userId: data.userId ?? null,
    ipAddress: data.ipAddress ?? null,
    remotePort: data.remotePort ?? null,
    userAgent: data.userAgent ?? null,
    origin: data.origin ?? null,
  }
}
