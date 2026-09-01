import request from 'supertest'
import { expect, type TestContext } from 'vitest'
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'
import { app } from 'app'

// Layer 1 — Acceptance (Gherkin). Executes features/health-check.feature over the
// real HTTP boundary. Runs in the `acceptance` vitest project, which uses the
// Docker Postgres environment (the controller does `SELECT 1`).
const feature = await loadFeature('features/health-check.feature')

describeFeature(feature, ({ Scenario, BeforeAllScenarios, AfterAllScenarios }) => {
  BeforeAllScenarios(async () => {
    await app.ready()
  })

  AfterAllScenarios(async () => {
    await app.close()
  })

  Scenario('Reports ok when the database is reachable', ({ Given, When, Then, And }) => {
    let response: request.Response

    Given('the API is running', () => {
      expect(app.server).toBeDefined()
    })

    When('the client sends a GET request to {string}', async (_ctx: TestContext, path: string) => {
      response = await request(app.server).get(path)
    })

    Then('the response status is {number}', (_ctx: TestContext, status: number) => {
      expect(response.status).toBe(status)
    })

    And('the response body field {string} is {string}', (_ctx: TestContext, field: string, value: string) => {
      expect(response.body[field]).toBe(value)
    })

    And('the response body has an {string} field', (_ctx: TestContext, field: string) => {
      expect(response.body).toHaveProperty(field)
    })
  })
})
