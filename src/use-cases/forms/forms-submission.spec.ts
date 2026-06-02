import { describe, it, expect, vi, afterEach } from 'vitest'
import { FormsSubmissionUseCase } from './forms-submission'
import { InMemoryFormsSubmissionRepository } from '@repositories/in-memory/in-memory-forms-submission-repository'
import { FormSubmissionError } from '@use-cases/errors/form-submission-error'
import { ok, err } from 'core/shared/result'

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
})
