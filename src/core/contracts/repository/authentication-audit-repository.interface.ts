import { AuthenticationAudit, AuthenticationStatus } from '@prisma/client'

export interface AuthenticationAuditInput {
  status: AuthenticationStatus
  userId?: number | null
  ipAddress?: string | null
  remotePort?: string | null
  userAgent?: string | null
  origin?: string | null
}

export interface AuthenticationAuditRepository {
  create(data: AuthenticationAuditInput): Promise<AuthenticationAudit>
}