import request from 'supertest'
import { expect, vi, type TestContext } from 'vitest'
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'

// The use-case is replaced at its factory: these scenarios are about the HTTP
// contract (the `origin` field reaching the client as the use-case computed
// it), not about geocoding, which has its own suites.
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }))

vi.mock('@modules/churches/factories/make-find-nearest-churches.service', () => ({
  makeFindNearestChurchesUseCase: () => ({ execute: mockExecute }),
}))

const { app } = await import('app')
// Relative with an extension: the @modules alias does not resolve from an ESM (.mts) file under nodenext.
const { InvalidCepError } = await import('../errors/invalid-cep-error.js')

const feature = await loadFeature('features/nearest-churches-origin.feature')

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
    mockExecute.mockImplementation(async ({ cep }: { cep: string }) =>
      cep.replace(/\D/g, '') === '00000000'
        ? // `err(...)` / `ok(...)` by hand: a wildcard path alias does not resolve from an ESM
          // (.mts) file under nodenext without an extension.
          { success: false, error: new InvalidCepError() }
        : {
            success: true,
            value: {
              nearestChurchesInfo: [],
              origin: { lat: -22.9035, lon: -43.1098 },
              totalFound: 0,
              precision: 'ROOFTOP',
              mode: 'pedestrian',
            },
          },
    )
  })

  function givenApi(Given: (text: string, fn: () => void) => void) {
    Given('the API is running', () => {
      expect(app.server).toBeDefined()
    })
  }

  function askFor(When: (text: string, fn: (ctx: TestContext, cep: string) => Promise<void>) => void) {
    When('the client asks for the nearest churches to CEP {string}', async (_ctx: TestContext, cep: string) => {
      response = await request(app.server).get('/churches/nearest').query({ cep })
    })
  }

  function thenStatus(Then: (text: string, fn: (ctx: TestContext, status: number) => void) => void) {
    Then('the response status is {number}', (_ctx: TestContext, status: number) => {
      expect(response.status).toBe(status)
    })
  }

  Scenario('The answer carries the point the CEP resolved to', ({ Given, When, Then, And }) => {
    givenApi(Given)
    askFor(When)
    thenStatus(Then)

    And(
      'the response origin is latitude {string} and longitude {string}',
      (_ctx: TestContext, lat: string, lon: string) => {
        expect(response.body.origin).toEqual({ lat: Number(lat), lon: Number(lon) })
      },
    )
  })

  Scenario('No origin is invented when the CEP does not exist', ({ Given, When, Then, And }) => {
    givenApi(Given)
    askFor(When)
    thenStatus(Then)

    And('the response has no origin', () => {
      expect(response.body).not.toHaveProperty('origin')
      expect(response.body).toMatchObject({ code: 'INVALID_CEP' })
    })
  })
})
