import { describe, it, expect, vi } from 'vitest'
import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { InMemoryOutboxRepository } from '@repositories/in-memory/in-memory-outbox-repository'
import { OutboxEventUseCase } from '@use-cases/outbox-event/outbox-event-use-case'
import { RegisterUserUseCase } from './register-user'
import { ForgotPasswordUseCase } from './forgot-password'
import { ResetPasswordUseCase } from './reset-password'
import { InvalidTokenError } from '@use-cases/errors/invalid-token-error'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { PasswordResetRequestedPayload } from 'core/types/outbox/outbox-event-input'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { compare } from 'bcryptjs'
import { isOk, isErr, err } from 'core/shared/result'
import { InfrastructureError } from 'errors/infrastructure-error'

class InfraTestError extends InfrastructureError {
  constructor() {
    super({ code: 'INFRA_TEST_ERROR', message: 'falha de infra injetada' })
  }
}

/**
 * Fluxo real de ponta a ponta em memória: o forgot-password grava o hash no
 * usuário e o token cru vai para o payload da outbox — como no e-mail enviado.
 */
async function makeSutWithToken() {
  const usersRepository = new InMemoryUsersRepository()
  const outboxRepository = new InMemoryOutboxRepository()
  const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository, new OutboxEventUseCase(outboxRepository))
  const resetPasswordUseCase = new ResetPasswordUseCase(usersRepository)
  const registerUseCase = new RegisterUserUseCase(usersRepository)

  const email = `johndoe${Date.now()}@gmail.com`
  const registerResult = await registerUseCase.execute({
    name: 'John Doe',
    email,
    cpf: cpfValidator.generate(),
    password: 'Teste123x!',
    username: 'johndoe',
    role: UserRole.DEFAULT,
  })
  expect(isOk(registerResult)).toBe(true)

  const forgotResult = await forgotPasswordUseCase.execute({ email })
  expect(isOk(forgotResult)).toBe(true)

  // O token cru vive apenas no payload transitório (e no e-mail)
  const rawToken = (outboxRepository.items[0].payload as PasswordResetRequestedPayload).token

  async function getUser() {
    const result = await usersRepository.findBy({ email })
    if (!isOk(result) || !result.value) throw new Error('setup: usuário não encontrado')
    return result.value
  }

  return { usersRepository, resetPasswordUseCase, rawToken, getUser }
}

describe('Reset Password Use Case', () => {
  it('token desconhecido: InvalidTokenError sem alterar nenhum usuário', async () => {
    const { usersRepository, resetPasswordUseCase } = await makeSutWithToken()
    const updateSpy = vi.spyOn(usersRepository, 'updatePassword')

    const result = await resetPasswordUseCase.execute({ token: 'token-que-nao-existe', password: 'newPassword123!' })

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBeInstanceOf(InvalidTokenError)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('busca é feita pelo HASH do token cru (regressão do hashing at-rest)', async () => {
    const { resetPasswordUseCase, rawToken, getUser } = await makeSutWithToken()
    const user = await getUser()

    // O valor armazenado não é o token cru — usar o hash direto como "token" falha
    expect(user.token).not.toBe(rawToken)
    const withStoredValue = await resetPasswordUseCase.execute({ token: user.token!, password: 'newPassword123!' })
    expect(isErr(withStoredValue)).toBe(true)

    // O token cru (do e-mail) funciona
    const withRawToken = await resetPasswordUseCase.execute({ token: rawToken, password: 'newPassword123!' })
    expect(isOk(withRawToken)).toBe(true)
  })

  it('tokenExpiresAt ausente: InvalidTokenError e higiene limpa as colunas de token', async () => {
    const { resetPasswordUseCase, rawToken, getUser } = await makeSutWithToken()
    const user = await getUser()
    user.tokenExpiresAt = null

    const result = await resetPasswordUseCase.execute({ token: rawToken, password: 'newPassword123!' })

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBeInstanceOf(InvalidTokenError)

    const cleaned = await getUser()
    expect(cleaned.token).toBeNull()
    expect(cleaned.tokenExpiresAt).toBeNull()
  })

  it('token expirado: InvalidTokenError e higiene preguiçosa limpa token e expiração', async () => {
    const { resetPasswordUseCase, rawToken, getUser } = await makeSutWithToken()
    const user = await getUser()
    user.tokenExpiresAt = new Date(Date.now() - 60 * 60 * 1000)

    const result = await resetPasswordUseCase.execute({ token: rawToken, password: 'newPassword123!' })

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBeInstanceOf(InvalidTokenError)

    const cleaned = await getUser()
    expect(cleaned.token).toBeNull()
    expect(cleaned.tokenExpiresAt).toBeNull()
  })

  it('falha na limpeza do token expirado: ainda retorna InvalidTokenError (best-effort, nunca mascara)', async () => {
    // Time is frozen for this one rather than compared against the wall clock.
    //
    // The expiry margin here used to be one second, and the branch under test
    // is `tokenExpiresAt < new Date()` — so the whole assertion depended on the
    // clock not moving backwards between the two statements. On this WSL2 host
    // it does, under load: the ci:local run that verified this work printed a
    // stage duration of `-76s`. A 76-second backwards jump makes a token
    // expired "one second ago" read as still valid, the expired branch is
    // skipped, the real updatePassword consumes the injected failure, and the
    // test fails with InfraTestError instead of InvalidTokenError — which is
    // exactly how it failed once here.
    //
    // `toFake: ['Date']` only: bcrypt's async hashing below schedules real
    // work, and faking setTimeout with it would hang the test rather than
    // stabilise it.
    vi.useFakeTimers({ toFake: ['Date'] })

    try {
      const { usersRepository, resetPasswordUseCase, rawToken, getUser } = await makeSutWithToken()
      const user = await getUser()
      user.tokenExpiresAt = new Date(Date.now() - 1000)
      vi.spyOn(usersRepository, 'updatePassword').mockResolvedValueOnce(err(new InfraTestError()))

      const result = await resetPasswordUseCase.execute({ token: rawToken, password: 'newPassword123!' })

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error).toBeInstanceOf(InvalidTokenError)
    } finally {
      vi.useRealTimers()
    }
  })

  it('token válido: redefine a senha, limpa o token e marca passwordChangedAt/updatedAt', async () => {
    const { resetPasswordUseCase, rawToken } = await makeSutWithToken()

    const before = Date.now()
    const result = await resetPasswordUseCase.execute({ token: rawToken, password: 'newPassword123!' })
    const after = Date.now()

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    const user = result.value.user
    expect(user.token).toBeNull()
    expect(user.tokenExpiresAt).toBeNull()

    const passwordChangedAt = new Date(user.passwordChangedAt!).getTime()
    expect(passwordChangedAt).toBeGreaterThanOrEqual(before)
    expect(passwordChangedAt).toBeLessThanOrEqual(after)

    const updatedAt = new Date(user.updatedAt!).getTime()
    expect(updatedAt).toBeGreaterThanOrEqual(before)
    expect(updatedAt).toBeLessThanOrEqual(after)

    expect(await compare('newPassword123!', user.passwordHash)).toBe(true)
  })

  it('token já usado não funciona de novo (single-use)', async () => {
    const { resetPasswordUseCase, rawToken } = await makeSutWithToken()

    const first = await resetPasswordUseCase.execute({ token: rawToken, password: 'newPassword123!' })
    expect(isOk(first)).toBe(true)

    const second = await resetPasswordUseCase.execute({ token: rawToken, password: 'outraSenha123!' })
    expect(isErr(second)).toBe(true)
    if (!isErr(second)) return
    expect(second.error).toBeInstanceOf(InvalidTokenError)
  })

  it('falha ao atualizar a senha: propaga o err', async () => {
    const { usersRepository, resetPasswordUseCase, rawToken } = await makeSutWithToken()
    const infraError = new InfraTestError()
    vi.spyOn(usersRepository, 'updatePassword').mockResolvedValueOnce(err(infraError))

    const result = await resetPasswordUseCase.execute({ token: rawToken, password: 'newPassword123!' })

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBe(infraError)
  })
})
