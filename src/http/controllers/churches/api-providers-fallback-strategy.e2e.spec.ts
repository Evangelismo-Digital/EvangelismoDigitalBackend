import { app } from 'app'
import { AwesomeApiProvider } from 'providers/address-provider/awesome-api-provider'
import { ViaCepProvider } from 'providers/address-provider/viaCep-provider'
import { LocationIqProvider } from 'providers/geo-provider/location-iq-provider'
import { NominatimGeoProvider } from 'providers/geo-provider/nominatim-provider'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRedisCacheConnection } from '@lib/redis/connections/redis-cache-connection'
import { BrasilApiProvider } from 'providers/address-provider/brasil-api-provider'
import { RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { AddressProviderFailureError } from 'providers/address-provider/error/address-provider-failure-error'
import { GeoProviderFailureError } from '@use-cases/errors/geo-provider-failure-error'

// NOTE: This test suite hits REAL APIs for the "OK" scenarios.
// It mocks ONLY the failures to force the fallback logic to execute.

const redisConnection = createRedisCacheConnection()

describe('Real Geocoding Fallback Scenarios (e2e)', () => {
  beforeAll(async () => {
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await redisConnection.quit()
  })

  beforeEach(async () => {
    vi.restoreAllMocks()

    // Mock rate limiter to always allow requests (prevent Redis timeout issues in tests)
    vi.spyOn(RedisRateLimiter.prototype, 'tryConsume').mockResolvedValue(true)

    // Ensure cache is clear between tests to prevent pollution
    const keys = await redisConnection.keys('cache:*')
    if (keys.length > 0) {
      await redisConnection.del(...keys)
    }
  })

  // Known Valid CEP (Av. Paulista, SP)
  const VALID_CEP = '01310100'
  // Invalid CEP
  const INVALID_CEP = '00000000'

  // ==============================================================================
  // 1. AwesomeProvider OK
  // ==============================================================================
  it('Scenario 1: AwesomeProvider OK (Fast Path)', async () => {
    const spyAwesome = vi.spyOn(AwesomeApiProvider.prototype, 'fetchAddress')
    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchAddress')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    expect(response.statusCode).toEqual(200)
    expect(response.body.churches).toBeDefined()

    expect(spyAwesome).toHaveBeenCalled()
    expect(spyViaCep).not.toHaveBeenCalled()
  }, 10000)

  // ==============================================================================
  // 2. AwesomeProvider fail -> BrasilApiProvider fail -> ViaCepProvider fail (Invalid CEP)
  // ==============================================================================
  it('Scenario 2: Awesome Fail -> BrasilAPI Fail -> ViaCep Fail (Invalid CEP)', async () => {
    const response = await request(app.server).get('/churches/nearest').query({ cep: INVALID_CEP })

    // Check HTTP response status and body
    expect(response.statusCode).toEqual(400)
  }, 10000)

  // ==============================================================================
  // AwesomeProvider fail -> BrasilApiProvider fail -> ViaCepProvider fail (System Failure)
  // ==============================================================================
  it('Scenario 3: Awesome Fail -> BrasilAPI Fail -> ViaCep Fail (System Failure)', async () => {
    const spyAwesome = vi
      .spyOn(AwesomeApiProvider.prototype, 'fetchAddress')
      .mockRejectedValue(new AddressProviderFailureError())
    const spyBrasilApi = vi
      .spyOn(BrasilApiProvider.prototype, 'fetchAddress')
      .mockRejectedValue(new AddressProviderFailureError())
    const spyViaCep = vi
      .spyOn(ViaCepProvider.prototype, 'fetchAddress')
      .mockRejectedValue(new AddressProviderFailureError())

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    // Check HTTP response status and body
    expect(response.statusCode).toEqual(503)

    expect(spyAwesome).toHaveBeenCalled()
    expect(spyBrasilApi).toHaveBeenCalled()
    expect(spyViaCep).toHaveBeenCalled()
  }, 10000)

  // ==============================================================================
  // 3. AwesomeProvider fail -> BrasilApiProvider fail -> ViaCepProvider ok -> LocationIQ ok
  // ==============================================================================
  it('Scenario 4: Awesome Fail -> BrasilAPI Fail -> ViaCep OK -> LocationIQ OK', async () => {
    const spyAwesome = vi
      .spyOn(AwesomeApiProvider.prototype, 'fetchAddress')
      .mockRejectedValue(new AddressProviderFailureError())

    const spyBrasilApi = vi
      .spyOn(BrasilApiProvider.prototype, 'fetchAddress')
      .mockRejectedValue(new AddressProviderFailureError())

    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchAddress')

    const spyLocationIq = vi.spyOn(LocationIqProvider.prototype, 'search')

    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'search')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    expect(response.statusCode).toEqual(200)
    expect(response.body.churches).toBeDefined()

    expect(spyAwesome).toHaveBeenCalled()
    expect(spyBrasilApi).toHaveBeenCalled()
    expect(spyViaCep).toHaveBeenCalled()
    expect(spyLocationIq).toHaveBeenCalled()
    expect(spyNominatim).not.toHaveBeenCalled()
  }, 20000)

  // ==============================================================================
  // 4. Awesome fail -> BrasilApiProvider fail -> ViaCep ok -> LocationIQ fail -> Nominatim ok
  // ==============================================================================
  it('Scenario 5: Awesome Fail -> BrasilAPI Fail -> ViaCep OK -> LocationIQ Fail -> Nominatim OK', async () => {
    vi.spyOn(AwesomeApiProvider.prototype, 'fetchAddress').mockRejectedValue(new AddressProviderFailureError())

    vi.spyOn(BrasilApiProvider.prototype, 'fetchAddress').mockRejectedValue(new AddressProviderFailureError())

    const spyLocationIq = vi
      .spyOn(LocationIqProvider.prototype, 'search')
      .mockRejectedValue(new GeoProviderFailureError())

    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchAddress')
    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'search')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    expect(response.statusCode).toEqual(200)
    expect(response.body.churches).toBeDefined()

    expect(spyViaCep).toHaveBeenCalled()
    expect(spyLocationIq).toHaveBeenCalled()
    expect(spyNominatim).toHaveBeenCalled()
  }, 25000)

  // ==============================================================================
  // 6. Awesome fail -> BrasilApiProvider fail -> ViaCep ok -> LocationIQ fail-> Nominatim fail
  // ==============================================================================
  it('Scenario 6: Everything Fails', async () => {
    vi.spyOn(AwesomeApiProvider.prototype, 'fetchAddress').mockRejectedValue(new AddressProviderFailureError())
    vi.spyOn(BrasilApiProvider.prototype, 'fetchAddress').mockRejectedValue(new AddressProviderFailureError())
    // ViaCep works to get address but geocoding fails on both providers
    vi.spyOn(LocationIqProvider.prototype, 'search').mockRejectedValue(new GeoProviderFailureError())
    vi.spyOn(NominatimGeoProvider.prototype, 'search').mockRejectedValue(new GeoProviderFailureError())

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    // Check HTTP response status and body
    expect(response.statusCode).toEqual(503)
    expect(response.body.message).toBeDefined()
  }, 10000)

  // ==============================================================================
  // 7. Awesome fail -> BrasilApiProvider ok -> LocationIQ ok
  // ==============================================================================
  it('Scenario 7: Awesome fail -> BrasilApiProvider ok -> LocationIQ ok', async () => {
    const spyAwesome = vi
      .spyOn(AwesomeApiProvider.prototype, 'fetchAddress')
      .mockRejectedValue(new AddressProviderFailureError())
    const spyBrasilApi = vi.spyOn(BrasilApiProvider.prototype, 'fetchAddress')
    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchAddress')

    const spyLocationIq = vi.spyOn(LocationIqProvider.prototype, 'search')
    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'search')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    // Check HTTP response status and body
    expect(response.statusCode).toEqual(200)
    expect(spyAwesome).toHaveBeenCalled()
    expect(spyBrasilApi).toHaveBeenCalled()
    expect(spyViaCep).not.toHaveBeenCalled()
    expect(spyLocationIq).toHaveBeenCalled()
    expect(spyNominatim).not.toHaveBeenCalled()
  }, 10000)

  // ==============================================================================
  // 8. Awesome fail -> BrasilApiProvider ok -> LocationIQ fail-> Nominatim ok
  // ==============================================================================
  it('Scenario 8: Awesome fail -> BrasilApiProvider ok -> LocationIQ fail-> Nominatim ok', async () => {
    const spyAwesome = vi
      .spyOn(AwesomeApiProvider.prototype, 'fetchAddress')
      .mockRejectedValue(new AddressProviderFailureError())
    const spyBrasilApi = vi.spyOn(BrasilApiProvider.prototype, 'fetchAddress')
    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchAddress')

    const spyLocationIq = vi
      .spyOn(LocationIqProvider.prototype, 'search')
      .mockRejectedValue(new GeoProviderFailureError())
    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'search')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    // Check HTTP response status and body
    expect(response.statusCode).toEqual(200)
    expect(spyAwesome).toHaveBeenCalled()
    expect(spyBrasilApi).toHaveBeenCalled()
    expect(spyViaCep).not.toHaveBeenCalled()
    expect(spyLocationIq).toHaveBeenCalled()
    expect(spyNominatim).toHaveBeenCalled()
  }, 10000)
})
