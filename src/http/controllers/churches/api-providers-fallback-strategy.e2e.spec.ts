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
import { ResilientChurchRoutingProviderDecorator } from 'providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator'
import { ok } from 'core/shared/result'

const redisConnection = createRedisCacheConnection()

// ATENÇÃO: esta suíte faz chamadas REAIS às APIs de geocodificação/endereço
// (LocationIQ, Nominatim, ViaCEP, BrasilAPI). O plano gratuito do LocationIQ
// limita a ~2 req/s e retorna HTTP 429 quando os cenários rodam em sequência.
// Um 429 é RETRYABLE, então a cadeia resiliente cai para o Nominatim — o que faz
// o Cenário 4 e o Cenário 7 (`expect(spyNominatim).not.toHaveBeenCalled()`)
// falharem localmente por cota, e não por lógica. Este projeto é intencionalmente
// excluído do CI (allowlist em .github/workflows/ci.yml); para rodá-lo verde
// localmente, execute-o isolado e espace as execuções para respeitar o limite.
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
    vi.spyOn(ResilientChurchRoutingProviderDecorator.prototype, 'getDistances').mockImplementation(async (params) => {
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
    const spyAwesome = vi.spyOn(AwesomeApiProvider.prototype, 'fetchRawAddress')
    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchRawAddress')

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
      .spyOn(AwesomeApiProvider.prototype, 'fetchRawAddress')
      .mockRejectedValue(new Error('AwesomeAPI Network error'))
    const spyBrasilApi = vi
      .spyOn(BrasilApiProvider.prototype, 'fetchRawAddress')
      .mockRejectedValue(new Error('BrasilAPI Network error'))
    const spyViaCep = vi
      .spyOn(ViaCepProvider.prototype, 'fetchRawAddress')
      .mockRejectedValue(new Error('ViaCEP Network error'))

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    console.log('Scenario 3 response body:', response.status, response.body)

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
      .spyOn(AwesomeApiProvider.prototype, 'fetchRawAddress')
      .mockRejectedValue(new Error('AwesomeAPI Network error'))

    const spyBrasilApi = vi
      .spyOn(BrasilApiProvider.prototype, 'fetchRawAddress')
      .mockRejectedValue(new Error('BrasilAPI Network error'))

    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchRawAddress')

    const spyLocationIq = vi.spyOn(LocationIqProvider.prototype, 'searchRaw')

    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'searchRaw')

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
    vi.spyOn(AwesomeApiProvider.prototype, 'fetchRawAddress').mockRejectedValue(new Error('AwesomeAPI Network error'))

    vi.spyOn(BrasilApiProvider.prototype, 'fetchRawAddress').mockRejectedValue(new Error('BrasilAPI Network error'))

    const spyLocationIq = vi
      .spyOn(LocationIqProvider.prototype, 'searchRaw')
      .mockRejectedValue(new Error('LocationIQ Network error'))

    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchRawAddress')
    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'searchRaw')

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
    vi.spyOn(AwesomeApiProvider.prototype, 'fetchRawAddress').mockRejectedValue(new Error('AwesomeAPI Network error'))
    vi.spyOn(BrasilApiProvider.prototype, 'fetchRawAddress').mockRejectedValue(new Error('BrasilAPI Network error'))
    // ViaCep works to get address but geocoding fails on both providers
    vi.spyOn(LocationIqProvider.prototype, 'searchRaw').mockRejectedValue(new Error('LocationIQ Network error'))
    vi.spyOn(NominatimGeoProvider.prototype, 'searchRaw').mockRejectedValue(new Error('Nominatim Network error'))

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    expect(response.statusCode).toEqual(503)
    expect(response.body.message).toBeDefined()
  }, 10000)

  // ==============================================================================
  // 7. Awesome fail -> BrasilApiProvider ok -> LocationIQ ok
  // ==============================================================================
  it('Scenario 7: Awesome fail -> BrasilApiProvider ok -> LocationIQ ok', async () => {
    const spyAwesome = vi
      .spyOn(AwesomeApiProvider.prototype, 'fetchRawAddress')
      .mockRejectedValue(new Error('AwesomeAPI Network error'))
    const spyBrasilApi = vi.spyOn(BrasilApiProvider.prototype, 'fetchRawAddress')
    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchRawAddress')

    const spyLocationIq = vi.spyOn(LocationIqProvider.prototype, 'searchRaw')
    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'searchRaw')

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
      .spyOn(AwesomeApiProvider.prototype, 'fetchRawAddress')
      .mockRejectedValue(new Error('AwesomeAPI Network error'))
    const spyBrasilApi = vi.spyOn(BrasilApiProvider.prototype, 'fetchRawAddress')
    const spyViaCep = vi.spyOn(ViaCepProvider.prototype, 'fetchRawAddress')

    const spyLocationIq = vi
      .spyOn(LocationIqProvider.prototype, 'searchRaw')
      .mockRejectedValue(new Error('LocationIQ Network error'))
    const spyNominatim = vi.spyOn(NominatimGeoProvider.prototype, 'searchRaw')

    const response = await request(app.server).get('/churches/nearest').query({ cep: VALID_CEP })

    expect(response.statusCode).toEqual(200)
    expect(spyAwesome).toHaveBeenCalled()
    expect(spyBrasilApi).toHaveBeenCalled()
    expect(spyViaCep).not.toHaveBeenCalled()
    expect(spyLocationIq).toHaveBeenCalled()
    expect(spyNominatim).toHaveBeenCalled()
  }, 10000)
})
