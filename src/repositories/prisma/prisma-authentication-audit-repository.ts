import { prisma } from '@lib/prisma'
import { AuthenticationAudit } from '@prisma/client'
import { AuthenticationAuditInput, AuthenticationAuditRepository } from 'core/contracts/repository/authentication-audit-repository.interface'

export class PrismaAuthenticationAuditRepository implements AuthenticationAuditRepository {
  async create(data: AuthenticationAuditInput): Promise<AuthenticationAudit> {
    return await prisma.authenticationAudit.create({
      data: {
        status: data.status,
        userId: data.userId ?? null,
        ipAddress: data.ipAddress ?? null,
        remotePort: data.remotePort ?? null,
        userAgent: data.userAgent ?? null,
        origin: data.origin ?? null,
      },
    })
  }
}