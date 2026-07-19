import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthenticationStatus } from '@prisma/client'

vi.mock('@lib/logger', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger }
})

const mockCaptureError = vi.fn()

vi.mock('@lib/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

import { AuthenticationAuditUseCase } from './authentication-audit'
import { AuthenticationAuditRepository } from 'core/contracts/repository/authentication-audit-repository.interface'
import { AuthenticationAudit } from '@prisma/client'
import { ok, err, isOk, isErr } from 'core/shared/result'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { logger } from '@lib/logger'

describe('AuthenticationAuditUseCase', () => {
  let repository: AuthenticationAuditRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repository = { create: vi.fn() }
  })

  it('grava o registro de auditoria com sucesso, sem logar ou capturar no Sentry', async () => {
    repository.create = vi.fn().mockResolvedValue(ok({} as AuthenticationAudit))
    const useCase = new AuthenticationAuditUseCase(repository)

    const result = await useCase.execute({ status: AuthenticationStatus.SUCCESS, userId: 1 })

    expect(isOk(result)).toBe(true)
    expect(logger.error).not.toHaveBeenCalled()
    expect(mockCaptureError).not.toHaveBeenCalled()
  })

  it('falha ao gravar auditoria: loga o erro real (não apenas a mensagem) e captura no Sentry, já que o caller descarta o Result', async () => {
    const dbError = new DatabaseQueryError(new Error('conexão perdida'))
    repository.create = vi.fn().mockResolvedValue(err(dbError))
    const useCase = new AuthenticationAuditUseCase(repository)

    const result = await useCase.execute({ status: AuthenticationStatus.USER_NOT_EXISTS })

    expect(isErr(result)).toBe(true)
    expect(logger.error).toHaveBeenCalledWith(
      { error: dbError },
      'Falha ao criar registro de auditoria de autenticação',
    )
    expect(mockCaptureError).toHaveBeenCalledWith(dbError, { status: AuthenticationStatus.USER_NOT_EXISTS })
  })
})
