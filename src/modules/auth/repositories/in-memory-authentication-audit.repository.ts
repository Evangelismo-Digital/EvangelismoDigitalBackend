import { AuthenticationAudit } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import {
  AuthenticationAuditInput,
  AuthenticationAuditRepository,
} from '@modules/auth/repositories/authentication-audit-repository.interface'
import { Result, ok } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

export class InMemoryAuthenticationAuditRepository implements AuthenticationAuditRepository {
  public items: AuthenticationAudit[] = []

  async create(data: AuthenticationAuditInput): Promise<Result<AuthenticationAudit, AppError>> {
    const audit = {} as AuthenticationAudit

    Object.assign(audit, {
      id: randomUUID(),
      ipAddress: data.ipAddress ?? null,
      remotePort: data.remotePort ?? null,
      userAgent: data.userAgent ?? null,
      origin: data.origin ?? null,
      status: data.status,
      userId: data.userId ?? null,
      createdAt: new Date(),
    })

    this.items.push(audit)

    return ok(audit)
  }
}
