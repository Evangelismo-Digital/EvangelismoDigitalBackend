import { describe, it, expect, vi, afterEach } from 'vitest'
import { FormsSubmissionUseCase } from './forms-submission.service'
import { InMemoryFormsSubmissionRepository } from '@modules/forms/repositories/in-memory-forms-submission.repository'
import { FormSubmissionError } from '@modules/forms/errors/form-submission-error'
import { FormAlreadyExistsError } from '@modules/forms/errors/form-already-exists-error'
import { ok, err } from '@common/utils/result'

describe('Forms Submission Use Case', async () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const mockEventRegistration = {
    register: vi.fn().mockResolvedValue(
      ok({
        id: 1,
        publicId: 'outbox-uuid',
        eventType: 'form_submission',
        payload: JSON.stringify({}),
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
  }

  it('should create a form submission successfully', async () => {
    const formsRepository = new InMemoryFormsSubmissionRepository()
    const formsSubmissionUseCase = new FormsSubmissionUseCase(formsRepository, mockEventRegistration)

    const data = {
      name: 'John Doe',
      lastName: 'Smith',
      email: 'test@example.com',
      decisaoPorCristo: true,
      location: 'New York',
    }

    const result = await formsSubmissionUseCase.execute(data)
    expect(result.success).toBe(true)
    if (result.success) {
      const { sanitizedFormSubmission } = result.value

      expect(sanitizedFormSubmission).toMatchObject({
        name: data.name,
        lastName: data.lastName,
        email: data.email,
        decisaoPorCristo: data.decisaoPorCristo,
        location: data.location,
      })
    }
  })

  it('should set location to null if not provided', async () => {
    const formsRepository = new InMemoryFormsSubmissionRepository()
    const useCase = new FormsSubmissionUseCase(formsRepository, mockEventRegistration)

    const data = {
      name: 'John',
      lastName: 'Smith',
      email: 'john@example.com',
      decisaoPorCristo: false,
    }

    const result = await useCase.execute(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value.sanitizedFormSubmission.location).toBeNull()
    }
  })

  it('persists the phone and carries it in the outbox payload', async () => {
    const formsRepository = new InMemoryFormsSubmissionRepository()
    const useCase = new FormsSubmissionUseCase(formsRepository, mockEventRegistration)

    const result = await useCase.execute({
      name: 'John',
      lastName: 'Smith',
      email: 'john@example.com',
      phone: '21987654321',
      decisaoPorCristo: false,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value.sanitizedFormSubmission.phone).toBe('21987654321')
    expect(formsRepository.items[0].phone).toBe('21987654321')
    expect(mockEventRegistration.register).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ phone: '21987654321' }) }),
    )
  })

  it('stores and forwards a missing phone as null', async () => {
    const formsRepository = new InMemoryFormsSubmissionRepository()
    const useCase = new FormsSubmissionUseCase(formsRepository, mockEventRegistration)

    const result = await useCase.execute({
      name: 'John',
      lastName: 'Smith',
      email: 'john@example.com',
      decisaoPorCristo: false,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value.sanitizedFormSubmission.phone).toBeNull()
    expect(formsRepository.items[0].phone).toBeNull()
    expect(mockEventRegistration.register).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ phone: null }) }),
    )
  })

  it('should set ipAddress to null if not provided', async () => {
    const formsRepository = new InMemoryFormsSubmissionRepository()
    const useCase = new FormsSubmissionUseCase(formsRepository, mockEventRegistration)

    const data = {
      name: 'John',
      lastName: 'Smith',
      email: 'john@example.com',
      decisaoPorCristo: false,
    }

    const result = await useCase.execute(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value.sanitizedFormSubmission.ipAddress).toBeNull()
    }
  })

  it('should map ipAddress properly if provided', async () => {
    const formsRepository = new InMemoryFormsSubmissionRepository()
    const useCase = new FormsSubmissionUseCase(formsRepository, mockEventRegistration)

    const data = {
      name: 'John',
      lastName: 'Smith',
      email: 'john@example.com',
      decisaoPorCristo: false,
      ipAddress: '192.168.1.1',
    }

    const result = await useCase.execute(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value.sanitizedFormSubmission.ipAddress).toBe('192.168.1.1')
    }
  })

  it('should return FormSubmissionError if repository returns null/failure', async () => {
    const formsRepository = new InMemoryFormsSubmissionRepository()
    vi.spyOn(formsRepository, 'create').mockResolvedValueOnce(err(new FormSubmissionError()))
    const useCase = new FormsSubmissionUseCase(formsRepository, mockEventRegistration)

    const result = await useCase.execute({
      name: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      decisaoPorCristo: true,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FormSubmissionError)
    }
  })

  it('should return FormAlreadyExistsError if email is already registered', async () => {
    const formsRepository = new InMemoryFormsSubmissionRepository()
    await formsRepository.create({
      name: 'Existing',
      lastName: 'User',
      email: 'existing@example.com',
      decisaoPorCristo: false,
    })

    const useCase = new FormsSubmissionUseCase(formsRepository, mockEventRegistration)

    const result = await useCase.execute({
      name: 'New',
      lastName: 'User',
      email: 'existing@example.com',
      decisaoPorCristo: true,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FormAlreadyExistsError)
    }
  })
})
