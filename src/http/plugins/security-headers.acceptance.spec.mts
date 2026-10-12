import request from 'supertest'
import { expect, type TestContext } from 'vitest'
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'
import { app } from 'app'

const feature = await loadFeature('features/security-headers.feature')

describeFeature(feature, ({ Scenario, BeforeAllScenarios, AfterAllScenarios }) => {
  BeforeAllScenarios(async () => {
    await app.ready()
  })

  AfterAllScenarios(async () => {
    await app.close()
  })

  Scenario('Responses include Helmet security headers', ({ Given, When, Then, And }) => {
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

    And('the response includes the "content-security-policy" header', (_ctx: TestContext) => {
      expect(response.headers).toHaveProperty('content-security-policy')
    })

    And('the response includes the "x-frame-options" header', (_ctx: TestContext) => {
      expect(response.headers).toHaveProperty('x-frame-options')
    })

    And('the response includes the "x-content-type-options" header', (_ctx: TestContext) => {
      expect(response.headers).toHaveProperty('x-content-type-options')
    })
  })
})
