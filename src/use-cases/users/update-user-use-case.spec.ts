import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { UserAlreadyExistsError } from '@use-cases/errors/user-already-exists-error'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { UpdateUserUseCase } from './update-user'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { isOk, isErr, ok, err } from 'core/shared/result'

describe('Update Use Case', () => {
  it('should return UserNotFoundError when no user is found with the given publicId', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    const newEmail = `janedoe${Date.now()}@gmail.com`
    const newCpf = cpfValidator.generate()
    const newUsername = 'janedoe'
    const password = 'Teste123!!'

    const registerResult = await registerUseCase.execute({
      name: 'Jane Doe',
      email: newEmail,
      cpf: newCpf,
      password,
      username: newUsername,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)
    const user = (registerResult as any).value.user

    const updateSpy = vi.spyOn(usersRepository, 'findBy').mockResolvedValueOnce(ok(null))
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const updateResult = await updateUserUseCase.execute({
      publicId: user.publicId,
      name: 'Jane Doe Updated',
    })

    expect(isErr(updateResult)).toBe(true)
    if (isErr(updateResult)) {
      expect(updateResult.error).toBeInstanceOf(UserNotFoundError)
    }

    updateSpy.mockRestore()
  })

  it('should be able to update', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const newEmail = `janedoe${Date.now()}@gmail.com`
    const newCpf = cpfValidator.generate()
    const newUsername = 'janedoe'

    const password = 'Teste123!!'

    const registerResult = await registerUseCase.execute({
      name: 'Jane Doe',
      email: newEmail,
      cpf: newCpf,
      password,
      username: newUsername,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)
    const user = (registerResult as any).value.user

    const updatedName = 'Jane Doe Updated'
    const updatedEmail = `janedoeupdated${Date.now()}@gmail.com`
    const updatedUsername = 'janedoeupdated'

    const updateResult = await updateUserUseCase.execute({
      publicId: user.publicId,
      name: updatedName,
      email: updatedEmail,
      username: updatedUsername,
    })

    expect(isOk(updateResult)).toBe(true)
    if (isOk(updateResult)) {
      const updatedUser = updateResult.value.user
      expect(updatedUser.publicId).toBe(user.publicId)
      expect(updatedUser.name).toBe(updatedName)
      expect(updatedUser.email).toBe(updatedEmail)
      expect(updatedUser.username).toBe(updatedUsername)
    }
  })

  it('should return UserNotFoundError if User is not found by publicId', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    const registerResult = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: 'johndoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)

    const updateResult = await updateUserUseCase.execute({
      publicId: 'non-existing-public-id',
      name: 'Jane Doe',
    })

    expect(isErr(updateResult)).toBe(true)
    if (isErr(updateResult)) {
      expect(updateResult.error).toBeInstanceOf(UserNotFoundError)
    }
  })

  it('should not be able to update with email used by another user', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const repeatedEmail = `johndoe@gmail.com`
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123!!'

    const registerResult1 = await registerUseCase.execute({
      name: 'John Doe',
      email: repeatedEmail,
      cpf: uniqueCpf,
      password,
      username: 'johndoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult1)).toBe(true)

    const newEmail = `janedoe${Date.now()}@gmail.com`
    const newCpf = cpfValidator.generate()
    const newUsername = 'janedoe'

    const registerResult2 = await registerUseCase.execute({
      name: 'Jane Doe',
      email: newEmail,
      cpf: newCpf,
      password,
      username: newUsername,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult2)).toBe(true)
    const user = (registerResult2 as any).value.user

    const updateResult = await updateUserUseCase.execute({
      publicId: user.publicId,
      name: 'Jane Doe Updated',
      email: repeatedEmail,
    })

    expect(isErr(updateResult)).toBe(true)
    if (isErr(updateResult)) {
      expect(updateResult.error).toBeInstanceOf(UserAlreadyExistsError)
    }
  })

  it('should not be able to update with username used by another user', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const uniqueEmail = `johndoe@gmail.com`
    const repeatedUsername = 'johndoe'
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123!!'

    const registerResult1 = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: repeatedUsername,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult1)).toBe(true)

    const newEmail = `janedoe${Date.now()}@gmail.com`
    const newCpf = cpfValidator.generate()
    const newUsername = 'janedoe'

    const registerResult2 = await registerUseCase.execute({
      name: 'Jane Doe',
      email: newEmail,
      cpf: newCpf,
      password,
      username: newUsername,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult2)).toBe(true)
    const user = (registerResult2 as any).value.user

    const updateResult = await updateUserUseCase.execute({
      publicId: user.publicId,
      name: 'Jane Doe Updated',
      email: uniqueEmail,
      username: repeatedUsername,
    })

    expect(isErr(updateResult)).toBe(true)
    if (isErr(updateResult)) {
      expect(updateResult.error).toBeInstanceOf(UserAlreadyExistsError)
    }
  })

  it('should return error when update operation fails unexpectedly', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    const newEmail = `janedoe${Date.now()}@gmail.com`
    const newCpf = cpfValidator.generate()
    const newUsername = 'janedoe'
    const password = 'Teste123!!'

    const registerResult = await registerUseCase.execute({
      name: 'Jane Doe',
      email: newEmail,
      cpf: newCpf,
      password,
      username: newUsername,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)
    const user = (registerResult as any).value.user

    const expectedErr = new Error('Error updating user')
    const updateSpy = vi.spyOn(usersRepository, 'update').mockResolvedValueOnce(err(expectedErr) as any)
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const updateResult = await updateUserUseCase.execute({
      publicId: user.publicId,
      name: 'Jane Doe Updated',
    })

    expect(isErr(updateResult)).toBe(true)
    if (isErr(updateResult)) {
      expect(updateResult.error).toBe(expectedErr)
    }

    updateSpy.mockRestore()
  })

  it('should update only the name if only name is provided', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const registerResult = await registerUseCase.execute({
      name: 'Jane Doe',
      email: `janedoe${Date.now()}@gmail.com`,
      cpf: cpfValidator.generate(),
      password: 'Teste123!!',
      username: 'janedoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)
    const user = (registerResult as any).value.user

    const newName = 'Jane Doe Updated'
    const updateResult = await updateUserUseCase.execute({
      publicId: user.publicId,
      name: newName,
    })

    expect(isOk(updateResult)).toBe(true)
    if (isOk(updateResult)) {
      const updatedUser = updateResult.value.user
      expect(updatedUser.name).toBe(newName)
      expect(updatedUser.email).toBe(user.email)
      expect(updatedUser.username).toBe(user.username)
    }
  })

  it('should update only the email if only email is provided', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const registerResult = await registerUseCase.execute({
      name: 'Jane Doe',
      email: `janedoe${Date.now()}@gmail.com`,
      cpf: cpfValidator.generate(),
      password: 'Teste123!!',
      username: 'janedoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)
    const user = (registerResult as any).value.user

    const newEmail = `janedoeupdated${Date.now()}@gmail.com`
    const updateResult = await updateUserUseCase.execute({
      publicId: user.publicId,
      email: newEmail,
    })

    expect(isOk(updateResult)).toBe(true)
    if (isOk(updateResult)) {
      const updatedUser = updateResult.value.user
      expect(updatedUser.email).toBe(newEmail)
      expect(updatedUser.name).toBe(user.name)
      expect(updatedUser.username).toBe(user.username)
    }
  })

  it('should update only the username if only username is provided', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const registerResult = await registerUseCase.execute({
      name: 'Jane Doe',
      email: `janedoe${Date.now()}@gmail.com`,
      cpf: cpfValidator.generate(),
      password: 'Teste123!!',
      username: 'janedoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)
    const user = (registerResult as any).value.user

    const newUsername = 'janedoeupdated'
    const updateResult = await updateUserUseCase.execute({
      publicId: user.publicId,
      username: newUsername,
    })

    expect(isOk(updateResult)).toBe(true)
    if (isOk(updateResult)) {
      const updatedUser = updateResult.value.user
      expect(updatedUser.username).toBe(newUsername)
      expect(updatedUser.name).toBe(user.name)
      expect(updatedUser.email).toBe(user.email)
    }
  })

  it('should not update if no fields are provided', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const updateUserUseCase = new UpdateUserUseCase(usersRepository)

    const registerResult = await registerUseCase.execute({
      name: 'Jane Doe',
      email: `janedoe${Date.now()}@gmail.com`,
      cpf: cpfValidator.generate(),
      password: 'Teste123!!',
      username: 'janedoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)
    const user = (registerResult as any).value.user

    const updateResult = await updateUserUseCase.execute({
      publicId: user.publicId,
    })

    expect(isOk(updateResult)).toBe(true)
    if (isOk(updateResult)) {
      const updatedUser = updateResult.value.user
      expect(updatedUser.publicId).toBe(user.publicId)
      expect(updatedUser.name).toBe(user.name)
      expect(updatedUser.email).toBe(user.email)
      expect(updatedUser.username).toBe(user.username)
    }
  })
})
