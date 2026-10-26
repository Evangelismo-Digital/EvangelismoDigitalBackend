import request from 'supertest'
import { expect, vi, type TestContext } from 'vitest'
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'

// The use-case is replaced at its factory: these scenarios are about the HTTP
// contract (what the phone looks like once the request is validated), not about
// persistence, which the Postgres integration suite covers.
const { mockExecute, enqueueOutboxDispatch } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  enqueueOutboxDispatch: vi.fn(),
}))

vi.mock('@modules/forms/factories/make-form-submission.service', () => ({
  makeFormSubmissionUseCase: () => ({ execute: mockExecute }),
}))
vi.mock('@infra/outbox/queue/outbox-dispatch-queue', () => ({ enqueueOutboxDispatch }))

const { app } = await import('app')

const feature = await loadFeature('features/form-submission-phone.feature')

const FORM = { name: 'Maria', lastName: 'Silva', email: 'maria@example.com', decisaoPorCristo: false }

describeFeature(feature, ({ Scenario, BeforeAllScenarios, AfterAllScenarios, BeforeEachScenario }) => {
  let response: request.Response

  BeforeAllScenarios(async () => {
    await app.ready()
  })

  AfterAllScenarios(async () => {
    await app.close()
  })

  BeforeEachScenario(() => {
    mockExecute.mockReset()
    enqueueOutboxDispatch.mockReset()
    // `ok(...)` by hand: a wildcard path alias does not resolve from an ESM (.mts) file under nodenext.
    mockExecute.mockImplementation(async (input: Record<string, unknown>) => ({
      success: true,
      value: { sanitizedFormSubmission: { ...input, phone: input.phone ?? null }, outboxEvent: { publicId: 'evt' } },
    }))
  })

  function givenApi(Given: (text: string, fn: () => void) => void) {
    Given('the API is running', () => {
      expect(app.server).toBeDefined()
    })
  }

  function thenStatus(Then: (text: string, fn: (ctx: TestContext, status: number) => void) => void) {
    Then('the response status is {number}', (_ctx: TestContext, status: number) => {
      expect(response.status).toBe(status)
    })
  }

  function submitWithPhone(When: (text: string, fn: (ctx: TestContext, phone: string) => Promise<void>) => void) {
    When('the client submits the form with phone {string}', async (_ctx: TestContext, phone: string) => {
      response = await request(app.server)
        .post('/forms/submit-form')
        .send({ ...FORM, phone })
    })
  }

  Scenario('A masked Brazilian phone is accepted and kept as digits', ({ Given, When, Then, And }) => {
    givenApi(Given)
    submitWithPhone(When)
    thenStatus(Then)

    And('the submission was recorded with phone {string}', (_ctx: TestContext, phone: string) => {
      expect(mockExecute).toHaveBeenCalledTimes(1)
      expect(mockExecute.mock.calls[0][0]).toMatchObject({ phone })
      expect(response.body.sanitizedFormSubmission.phone).toBe(phone)
    })
  })

  Scenario('The phone is optional', ({ Given, When, Then, And }) => {
    givenApi(Given)

    When('the client submits the form without a phone', async () => {
      response = await request(app.server).post('/forms/submit-form').send(FORM)
    })

    thenStatus(Then)

    And('the submission was recorded without a phone', () => {
      expect(mockExecute).toHaveBeenCalledTimes(1)
      expect(mockExecute.mock.calls[0][0].phone).toBeUndefined()
      expect(response.body.sanitizedFormSubmission.phone).toBeNull()
    })
  })

  Scenario('A phone that is not a Brazilian number with its area code is refused', ({ Given, When, Then, And }) => {
    givenApi(Given)
    submitWithPhone(When)
    thenStatus(Then)

    And('nothing was recorded', () => {
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })
})
