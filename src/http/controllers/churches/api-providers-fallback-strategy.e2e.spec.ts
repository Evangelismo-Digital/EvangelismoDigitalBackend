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
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { errOf, ok } from 'core/shared/result'
import { StadiaChurchRoutingProvider } from 'providers/church-routing-provider/stadia-church-routing-provider'

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

    // Mock Stadia maps routing to avoid hitting the external API and failing E2E tests
    vi.spyOn(StadiaChurchRoutingProvider.prototype, 'getDistances').mockImplementation(async (params) => {
      return ok(params.destinations.map(() => ({ distance: 1.5, status: 0 })))
    })

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
    expect(response.body.nearestChurchesInfo).toBeDefined()

    expect(spyAwesome).toHaveBeenCalled()
    expect(spyViaCep).not.toHaveBeenCalled()
  }, 10000)

  // ==============================================================================
  // 2. AwesomeProvider fail -> BrasilApiProvider fail -> ViaCepProvider fail (Invalid CEP)
  // ==============================================================================
  it('Scenario 2: Awesome Fail -> BrasilAPI Fail -> ViaCep Fail (Invalid CEP)', async () => {
    const response = await request(app.server).get('/churches/nearest').query({ cep: INVALID_CEP })

    expect(response.statusCode).toEqual(404)
  }, 10000)

  // ==============================================================================
  // AwesomeProvider fail -> BrasilApiProvider fail -> ViaCepProvider fail (System Failure)
  // ==============================================================================
  it('Scenario 3: Awesome Fail -> BrasilAPI Fail -> ViaCep Fail (System Failure)', async () => {
    const spyAwesome = vi
      .spyOn(AwesomeApiProvider.prototype, 'fetchAddress')
      .mockResolvedValue(errOf(new ProviderFailureError('AwesomeAPI', new Error('Network error'))))
    const spyBrasilApi = vi
      .spyOn(BrasilApiProvider.prototype, 'fetchAddress')
      .mockResolvedValue(errOf(new ProviderFailureError('BrasilAPI', new Error('Network error'))))
    const spyViaCep = vi
      .spyOn(ViaCepProvider.prototype, 'fetchAddress')
      .mockResolvedValue(errOf(new ProviderFailureError('ViaCEP', new Error('Network error'))))

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

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
      .mockResolvedValue(errOf(new ProviderFailureError('AwesomeAPI', new Error('Network error'))))

    const spyBrasilApi = vi
      .spyOn(BrasilApiProvider.prototype, 'fetchAddress')
      .mockResolvedValue(errOf(new ProviderFailureError('BrasilAPI', new Error('Network error'))))

    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchAddress')

    const spyLocationIq = vi.spyOn(LocationIqProvider.prototype, 'search')

    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'search')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    expect(response.statusCode).toEqual(200)
    expect(response.body.nearestChurchesInfo).toBeDefined()

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
    vi.spyOn(AwesomeApiProvider.prototype, 'fetchAddress').mockResolvedValue(
      errOf(new ProviderFailureError('AwesomeAPI', new Error('Network error'))),
    )

    vi.spyOn(BrasilApiProvider.prototype, 'fetchAddress').mockResolvedValue(
      errOf(new ProviderFailureError('BrasilAPI', new Error('Network error'))),
    )

    const spyLocationIq = vi
      .spyOn(LocationIqProvider.prototype, 'search')
      .mockResolvedValue(errOf(new ProviderFailureError('LocationIQ', new Error('Network error'))))

    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchAddress')
    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'search')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    expect(response.statusCode).toEqual(200)
    expect(response.body.nearestChurchesInfo).toBeDefined()

    expect(spyViaCep).toHaveBeenCalled()
    expect(spyLocationIq).toHaveBeenCalled()
    expect(spyNominatim).toHaveBeenCalled()
  }, 25000)

  // ==============================================================================
  // 6. Awesome fail -> BrasilApiProvider fail -> ViaCep ok -> LocationIQ fail-> Nominatim fail
  // ==============================================================================
  it('Scenario 6: Everything Fails', async () => {
    vi.spyOn(AwesomeApiProvider.prototype, 'fetchAddress').mockResolvedValue(
      errOf(new ProviderFailureError('AwesomeAPI', new Error('Network error'))),
    )
    vi.spyOn(BrasilApiProvider.prototype, 'fetchAddress').mockResolvedValue(
      errOf(new ProviderFailureError('BrasilAPI', new Error('Network error'))),
    )
    // ViaCep works to get address but geocoding fails on both providers
    vi.spyOn(LocationIqProvider.prototype, 'search').mockResolvedValue(
      errOf(new ProviderFailureError('LocationIQ', new Error('Network error'))),
    )
    vi.spyOn(NominatimGeoProvider.prototype, 'search').mockResolvedValue(
      errOf(new ProviderFailureError('Nominatim', new Error('Network error'))),
    )

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    expect(response.statusCode).toEqual(503)
    expect(response.body.message).toBeDefined()
  }, 10000)

  // ==============================================================================
  // 7. Awesome fail -> BrasilApiProvider ok -> LocationIQ ok
  // ==============================================================================
  it('Scenario 7: Awesome fail -> BrasilApiProvider ok -> LocationIQ ok', async () => {
    const spyAwesome = vi
      .spyOn(AwesomeApiProvider.prototype, 'fetchAddress')
      .mockResolvedValue(errOf(new ProviderFailureError('AwesomeAPI', new Error('Network error'))))
    const spyBrasilApi = vi.spyOn(BrasilApiProvider.prototype, 'fetchAddress')
    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchAddress')

    const spyLocationIq = vi.spyOn(LocationIqProvider.prototype, 'search')
    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'search')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

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
      .mockResolvedValue(errOf(new ProviderFailureError('AwesomeAPI', new Error('Network error'))))
    const spyBrasilApi = vi.spyOn(BrasilApiProvider.prototype, 'fetchAddress')
    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchAddress')

    const spyLocationIq = vi
      .spyOn(LocationIqProvider.prototype, 'search')
      .mockResolvedValue(errOf(new ProviderFailureError('LocationIQ', new Error('Network error'))))
    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'search')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    expect(response.statusCode).toEqual(200)
    expect(spyAwesome).toHaveBeenCalled()
    expect(spyBrasilApi).toHaveBeenCalled()
    expect(spyViaCep).not.toHaveBeenCalled()
    expect(spyLocationIq).toHaveBeenCalled()
    expect(spyNominatim).toHaveBeenCalled()
  }, 10000)
})
