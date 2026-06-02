import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { ResilientAddressProvider } from './resilient-address-provider'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { NoAddressProviderError } from './error/no-address-provider-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { ok, errOf, isOk, isErr } from 'core/shared/result'

const mockAddress: IAddressData = {
  logradouro: 'Rua Teste',
  bairro: 'Bairro Teste',
  localidade: 'Cidade Teste',
  uf: 'TS',
}

describe('ResilientAddressProvider Unit Tests', () => {
  let provider1: IAddressProvider
  let provider2: IAddressProvider

  beforeEach(() => {
    vi.clearAllMocks()

    provider1 = { fetchAddress: vi.fn() }
    provider2 = { fetchAddress: vi.fn() }
  })

  const createProvider = (providers = [provider1, provider2]) => {
    return new ResilientAddressProvider(providers)
  }

  describe('Constructor', () => {
    it('should throw NoAddressProviderError if providers list is empty', () => {
      expect(() => createProvider([])).toThrow(NoAddressProviderError)
    })

    it('should initialize successfully with valid providers', () => {
      const provider = createProvider()
      expect(provider).toBeInstanceOf(ResilientAddressProvider)
    })
  })

  describe('executeStrategy (Provider Logic)', () => {
    it('should return result immediately if first provider succeeds', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(ok(mockAddress))

      const result = await provider.fetchAddress('12345678')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockAddress)
      }
      expect(provider1.fetchAddress).toHaveBeenCalled()
      expect(provider2.fetchAddress).not.toHaveBeenCalled()
    })

    it('should fallback to second provider if first returns NULL (not found)', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(ok(mockAddress))

      const result = await provider.fetchAddress('12345678')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockAddress)
      }
      expect(provider1.fetchAddress).toHaveBeenCalled()
      expect(provider2.fetchAddress).toHaveBeenCalled()
    })

    it('should fallback to second provider if first throws InvalidCepError', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(errOf(new InvalidCepError()))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(ok(mockAddress))

      const result = await provider.fetchAddress('12345678')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockAddress)
      }
      expect(provider2.fetchAddress).toHaveBeenCalled()
    })

    it('should fallback to second provider if first fails with System Error (Busy/Generic)', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(errOf(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(ok(mockAddress))

      const result = await provider.fetchAddress('12345678')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockAddress)
      }
      expect(provider2.fetchAddress).toHaveBeenCalled()
    })

    it('should throw InvalidCepError if ALL providers return not found (null/InvalidCep)', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(errOf(new InvalidCepError()))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(InvalidCepError)
      }
    })

    it('should return ServiceBusyError if the last provider had a ServiceBusy error', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(errOf(new ProviderFailureError('MockProvider1', new Error('Connection timeout'))))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(errOf(new ServiceBusyError('MockProvider2')))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError if the last provider had a non-busy System Error', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(errOf(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(errOf(new ProviderFailureError('MockProvider2', new Error('Connection timeout'))))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should return ServiceBusyError if ANY provider had a System Error and last was ServiceBusy, even if others said Not Found', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(errOf(new ServiceBusyError('MockProvider2')))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError if ANY provider had a non-busy System Error and last was not ServiceBusy, even if others said Not Found', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(errOf(new ProviderFailureError('MockProvider2', new Error('Network error'))))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should return ServiceBusyError if ALL providers have ServiceBusy errors', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(errOf(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(errOf(new ServiceBusyError('MockProvider2')))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError with wrapped error when last error is generic system error', async () => {
      const provider = createProvider()
      const systemError = new Error('Database connection failed')

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(errOf(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(errOf(new ProviderFailureError('MockProvider2', systemError)))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should stop immediately and return TimeoutExceededError if signal is aborted', async () => {
      const provider = createProvider()
      const controller = new AbortController()
      controller.abort(new Error('Timeout'))

      const result = await provider.fetchAddress('12345678', controller.signal)
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
      }

      expect(provider1.fetchAddress).not.toHaveBeenCalled()
    })
  })
})
