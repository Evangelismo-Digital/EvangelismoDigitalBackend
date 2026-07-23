import { describe, it, expect, vi } from 'vitest'
import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { InMemoryOutboxRepository } from '@repositories/in-memory/in-memory-outbox-repository'
import { OutboxEventUseCase } from '@use-cases/outbox-event/outbox-event-use-case'
import { RegisterUserUseCase } from './register-user'
import { ForgotPasswordUseCase } from './forgot-password'
import { hashResetToken } from './helpers/token-hash'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { PasswordResetRequestedPayload } from 'core/types/outbox/outbox-event-input'
import { PASSWORD_RESET_CONSTANTS } from 'messages/constants/auth/password-reset'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { isOk, isErr, err } from 'core/shared/result'
import { InfrastructureError } from 'errors/infrastructure-error'

class InfraTestError extends InfrastructureError {
  constructor() {
    super({ code: 'INFRA_TEST_ERROR', message: 'falha de infra injetada' })
  }
}

function makeSut() {
  const usersRepository = new InMemoryUsersRepository()
  const outboxRepository = new InMemoryOutboxRepository()
  const eventRegistration = new OutboxEventUseCase(outboxRepository)
  const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository, eventRegistration)
  const registerUseCase = new RegisterUserUseCase(usersRepository)

  return { usersRepository, outboxRepository, forgotPasswordUseCase, registerUseCase }
}

async function registerUser(registerUseCase: RegisterUserUseCase, email: string) {
  const registerResult = await registerUseCase.execute({
    name: 'John Doe',
    email,
    cpf: cpfValidator.generate(),
    password: 'Teste123x!',
    username: 'johndoe',
    role: UserRole.DEFAULT,
  })
  expect(isOk(registerResult)).toBe(true)
}

describe('Forgot Password Use Case', () => {
  it('e-mail desconhecido: sucesso no-op (sem evento, sem token) — nenhum oráculo de enumeração', async () => {
    const { outboxRepository, forgotPasswordUseCase } = makeSut()

    const result = await forgotPasswordUseCase.execute({ email: 'naoexiste@gmail.com' })

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value.outboxEvent).toBeNull()
    expect(outboxRepository.items).toHaveLength(0)
  })

  it('e-mail com formato inválido: sucesso no-op sem consultar o repositório', async () => {
    const { usersRepository, outboxRepository, forgotPasswordUseCase } = makeSut()
    const findSpy = vi.spyOn(usersRepository, 'findBy')

    const result = await forgotPasswordUseCase.execute({ email: 'nao-e-um-email' })

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value.outboxEvent).toBeNull()
    expect(findSpy).not.toHaveBeenCalled()
    expect(outboxRepository.items).toHaveLength(0)
  })

  it('usuário existente: grava o HASH do token no usuário e registra evento com o token cru no payload', async () => {
    const { usersRepository, outboxRepository, forgotPasswordUseCase, registerUseCase } = makeSut()
    const email = `johndoe${Date.now()}@gmail.com`
    await registerUser(registerUseCase, email)

    const before = Date.now()
    const result = await forgotPasswordUseCase.execute({ email })
    const after = Date.now()

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value.outboxEvent).not.toBeNull()

    // Evento registrado com o formato correto
    expect(outboxRepository.items).toHaveLength(1)
    const event = outboxRepository.items[0]
    expect(event.type).toBe('PasswordResetRequested')

    const payload = event.payload as PasswordResetRequestedPayload
    expect(payload.email).toBe(email)
    expect(payload.name).toBe('John Doe')
    expect(payload.token).toMatch(/^[0-9a-f]{64}$/) // token cru: 32 bytes em hex

    // O usuário guarda apenas o hash — nunca o token cru
    const userResult = await usersRepository.findBy({ email })
    if (!isOk(userResult) || !userResult.value) throw new Error('setup')
    const user = userResult.value
    expect(user.token).toBe(hashResetToken(payload.token))
    expect(user.token).not.toBe(payload.token)
    expect(payload.userPublicId).toBe(user.publicId)

    // Janela de expiração de 15 min, espelhada no evento e no payload
    const expectedExpiryMin = before + PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES * 60 * 1000
    const expectedExpiryMax = after + PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES * 60 * 1000
    const tokenExpiresAt = user.tokenExpiresAt!.getTime()
    expect(tokenExpiresAt).toBeGreaterThanOrEqual(expectedExpiryMin)
    expect(tokenExpiresAt).toBeLessThanOrEqual(expectedExpiryMax)
    expect(event.expiresAt?.getTime()).toBe(tokenExpiresAt)
    expect(payload.tokenExpiresAt).toBe(user.tokenExpiresAt!.toISOString())
  })

  it('tokens gerados em pedidos sucessivos são diferentes', async () => {
    const { outboxRepository, forgotPasswordUseCase, registerUseCase } = makeSut()
    const email = `johndoe${Date.now()}@gmail.com`
    await registerUser(registerUseCase, email)

    await forgotPasswordUseCase.execute({ email })
    await forgotPasswordUseCase.execute({ email })

    const [first, second] = outboxRepository.items.map((e) => (e.payload as PasswordResetRequestedPayload).token)
    expect(first).not.toBe(second)
  })

  it('falha de infra no findBy: propaga o err', async () => {
    const { usersRepository, forgotPasswordUseCase } = makeSut()
    const infraError = new InfraTestError()
    vi.spyOn(usersRepository, 'findBy').mockResolvedValueOnce(err(infraError))

    const result = await forgotPasswordUseCase.execute({ email: 'johndoe@gmail.com' })

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBe(infraError)
  })

  it('falha ao gravar o token: propaga o err sem registrar evento', async () => {
    const { usersRepository, outboxRepository, forgotPasswordUseCase, registerUseCase } = makeSut()
    const email = `johndoe${Date.now()}@gmail.com`
    await registerUser(registerUseCase, email)

    const infraError = new InfraTestError()
    vi.spyOn(usersRepository, 'updatePassword').mockResolvedValueOnce(err(infraError))

    const result = await forgotPasswordUseCase.execute({ email })

    expect(isErr(result)).toBe(true)
    expect(outboxRepository.items).toHaveLength(0)
  })

  it('falha ao registrar o evento na outbox: propaga o err (a transação do decorator reverte o token)', async () => {
    const { outboxRepository, forgotPasswordUseCase, registerUseCase } = makeSut()
    const email = `johndoe${Date.now()}@gmail.com`
    await registerUser(registerUseCase, email)

    outboxRepository.shouldFailOn.create = true

    const result = await forgotPasswordUseCase.execute({ email })

    expect(isErr(result)).toBe(true)
    expect(outboxRepository.items).toHaveLength(0)
  })
})
