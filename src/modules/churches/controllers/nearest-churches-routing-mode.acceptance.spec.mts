import request from 'supertest'
import { expect, vi, type TestContext } from 'vitest'
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'

// The use-case is replaced at its factory: these scenarios are about the HTTP
// contract (the `mode` query parameter, its default, its validation and the
// echo in the body), not about the providers, which have their own suites.
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }))

vi.mock('@modules/churches/factories/make-find-nearest-churches.service', () => ({
  makeFindNearestChurchesUseCase: () => ({ execute: mockExecute }),
}))

const { app } = await import('app')

const feature = await loadFeature('features/nearest-churches-routing-mode.feature')

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
    mockExecute.mockImplementation(async ({ profile }: { profile: string }) => ({
      // `ok(...)` by hand: a wildcard path alias does not resolve from an ESM
      // (.mts) file under nodenext without an extension.
      success: true,
      value: { nearestChurchesInfo: [], totalFound: 0, precision: 'ROOFTOP', mode: profile },
    }))
  })

  function givenApi(Given: (text: string, fn: () => void) => void) {
    Given('the API is running', () => {
      expect(app.server).toBeDefined()
    })
  }

  async function ask(cep: string, mode?: string) {
    response = await request(app.server)
      .get('/churches/nearest')
      .query(mode === undefined ? { cep } : { cep, mode })
  }

  Scenario('Walking is the default', ({ Given, When, Then, And }) => {
    givenApi(Given)

    When(
      'the client asks for the nearest churches to CEP {string} without a mode',
      async (_ctx: TestContext, cep: string) => {
        await ask(cep)
      },
    )

    Then('the response status is {number}', (_ctx: TestContext, status: number) => {
      expect(response.status).toBe(status)
    })

    And('the churches were routed for {string}', (_ctx: TestContext, mode: string) => {
      expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ profile: mode }))
    })

    And('the response body field {string} is {string}', (_ctx: TestContext, field: string, value: string) => {
      expect(response.body[field]).toBe(value)
    })
  })

  Scenario('The client chooses transport', ({ Given, When, Then, And }) => {
    givenApi(Given)

    When(
      'the client asks for the nearest churches to CEP {string} with mode {string}',
      async (_ctx: TestContext, cep: string, mode: string) => {
        await ask(cep, mode)
      },
    )

    Then('the response status is {number}', (_ctx: TestContext, status: number) => {
      expect(response.status).toBe(status)
    })

    And('the churches were routed for {string}', (_ctx: TestContext, mode: string) => {
      expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ profile: mode }))
    })

    And('the response body field {string} is {string}', (_ctx: TestContext, field: string, value: string) => {
      expect(response.body[field]).toBe(value)
    })
  })

  Scenario('An unknown mode is rejected', ({ Given, When, Then, And }) => {
    givenApi(Given)

    When(
      'the client asks for the nearest churches to CEP {string} with mode {string}',
      async (_ctx: TestContext, cep: string, mode: string) => {
        await ask(cep, mode)
      },
    )

    Then('the response status is {number}', (_ctx: TestContext, status: number) => {
      expect(response.status).toBe(status)
    })

    And('no routing was attempted', () => {
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })
})
