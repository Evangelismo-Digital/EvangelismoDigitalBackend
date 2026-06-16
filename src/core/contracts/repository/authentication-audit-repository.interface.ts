import { AuthenticationAudit, AuthenticationStatus } from '@prisma/client'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface AuthenticationAuditInput {
  status: AuthenticationStatus
  userId?: number | null
  ipAddress?: string | null
  remotePort?: string | null
  userAgent?: string | null
  origin?: string | null
}

export interface AuthenticationAuditRepository {
  create(data: AuthenticationAuditInput): Promise<Result<AuthenticationAudit, AppError>>
}
