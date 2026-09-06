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
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { Deadline } from 'core/shared/deadline'
import { logger } from '@lib/logger'
import { ok, err, isOk, isErr } from 'core/shared/result'

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

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(err(new InvalidCepError()))
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

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(err(new ServiceBusyError('MockProvider1')))
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
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(err(new InvalidCepError()))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(InvalidCepError)
      }
    })

    it('should return ServiceBusyError if the last provider had a ServiceBusy error', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(
        err(new ProviderFailureError(new Error('Connection timeout'))),
      )
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(err(new ServiceBusyError('MockProvider2')))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError if the last provider had a non-busy System Error', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(err(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(
        err(new ProviderFailureError(new Error('Connection timeout'))),
      )

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should return ServiceBusyError if ANY provider had a System Error and last was ServiceBusy, even if others said Not Found', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(err(new ServiceBusyError('MockProvider2')))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError if ANY provider had a non-busy System Error and last was not ServiceBusy, even if others said Not Found', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(err(new ProviderFailureError(new Error('Network error'))))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should return ServiceBusyError if ALL providers have ServiceBusy errors', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(err(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(err(new ServiceBusyError('MockProvider2')))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError with wrapped error when last error is generic system error', async () => {
      const provider = createProvider()
      const systemError = new Error('Database connection failed')

      vi.spyOn(provider1, 'fetchAddress').mockResolvedValue(err(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'fetchAddress').mockResolvedValue(err(new ProviderFailureError(systemError)))

      const result = await provider.fetchAddress('12345678')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('bails on an ABORTED failure without asking the next provider', async () => {
      // A spent request budget is terminal: every remaining provider would
      // fail identically and instantly, so the chain must not walk them.
      const aborted = new DeadlineExceededError('DEADLINE_EXPIRED')
      vi.mocked(provider1.fetchAddress).mockResolvedValue(err(aborted))
      vi.mocked(provider2.fetchAddress).mockResolvedValue(ok(mockAddress))

      const result = await createProvider().fetchAddress('01001000')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBe(aborted)
      }
      expect(provider2.fetchAddress).not.toHaveBeenCalled()
    })

    // Behaviour change (D8): an exhausted budget is ABORTED and terminal, not a
    // RETRYABLE timeout — the chain must not walk the remaining providers.
    it('should stop immediately and report the spent budget if the deadline is already expired', async () => {
      const provider = createProvider()
      const controller = new AbortController()
      controller.abort(new Error('Timeout'))

      const result = await provider.fetchAddress('12345678', Deadline.in(Infinity, { linkedTo: controller.signal }))
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
      }

      expect(provider1.fetchAddress).not.toHaveBeenCalled()
    })
  })

  describe('CEP normalisation', () => {
    it('strips formatting before the providers ever see the CEP', async () => {
      vi.mocked(provider1.fetchAddress).mockResolvedValue(ok(mockAddress))

      await createProvider().fetchAddress('01310-100')

      // Providers are handed digits only — never the user's formatting.
      expect(provider1.fetchAddress).toHaveBeenCalledWith('01310100', expect.any(Deadline))
    })

    it('strips every non-digit character, not just dashes', async () => {
      vi.mocked(provider1.fetchAddress).mockResolvedValue(ok(mockAddress))

      await createProvider().fetchAddress(' 01.310-100 ')

      expect(provider1.fetchAddress).toHaveBeenCalledWith('01310100', expect.any(Deadline))
    })

    it('keeps the digits rather than erasing them', async () => {
      vi.mocked(provider1.fetchAddress).mockResolvedValue(ok(mockAddress))

      await createProvider().fetchAddress('01310100')

      const cepArg = vi.mocked(provider1.fetchAddress).mock.calls[0][0]
      expect(cepArg).toMatch(/^\d{8}$/)
    })
  })

  describe('chain exhaustion', () => {
    it('reports the last retryable error, not a generic failure, when every provider is degraded', async () => {
      vi.mocked(provider1.fetchAddress).mockResolvedValue(err(new ServiceBusyError('AwesomeAPI')))
      vi.mocked(provider2.fetchAddress).mockResolvedValue(err(new ProviderFailureError(new Error('boom'))))

      const result = await createProvider().fetchAddress('01310100')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        // The *last* provider's error surfaces, so operators see the freshest failure.
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('prefers InvalidCepError only when every provider agreed the CEP does not exist', async () => {
      vi.mocked(provider1.fetchAddress).mockResolvedValue(ok(null))
      vi.mocked(provider2.fetchAddress).mockResolvedValue(ok(null))

      const result = await createProvider().fetchAddress('01310100')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(InvalidCepError)
    })

    it('does not call it a bad CEP when one provider merely failed', async () => {
      vi.mocked(provider1.fetchAddress).mockResolvedValue(ok(null))
      vi.mocked(provider2.fetchAddress).mockResolvedValue(err(new ServiceBusyError('ViaCEP')))

      const result = await createProvider().fetchAddress('01310100')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).not.toBeInstanceOf(InvalidCepError)
    })
  })

  describe('diagnostic log contract', () => {
    // These logs are how a provider degradation is diagnosed in production, so
    // both the message and the context they carry are part of the contract.
    it('names the provider that answered', async () => {
      const named = Object.assign(provider1, { providerName: 'AwesomeAPI' })
      vi.mocked(named.fetchAddress).mockResolvedValue(ok(mockAddress))

      await new ResilientAddressProvider([named]).fetchAddress('01310100')

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'AwesomeAPI' }),
        expect.stringContaining('sucesso'),
      )
    })

    it('names the provider that returned nothing', async () => {
      const named = Object.assign(provider1, { providerName: 'AwesomeAPI' })
      vi.mocked(named.fetchAddress).mockResolvedValue(ok(null))

      await new ResilientAddressProvider([named]).fetchAddress('01310100')

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'AwesomeAPI' }),
        expect.stringContaining('não encontrado'),
      )
    })

    it('logs the CEP alongside the provider that confirmed it does not exist', async () => {
      const named = Object.assign(provider1, { providerName: 'ViaCEP' })
      vi.mocked(named.fetchAddress).mockResolvedValue(err(new InvalidCepError('01310100')))

      await new ResilientAddressProvider([named]).fetchAddress('01310100')

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'ViaCEP', cep: '01310100' }),
        expect.stringContaining('não existe'),
      )
    })

    it('warns with the provider, attempt number and error when falling back', async () => {
      const named1 = Object.assign(provider1, { providerName: 'AwesomeAPI' })
      const named2 = Object.assign(provider2, { providerName: 'ViaCEP' })
      const busy = new ServiceBusyError('AwesomeAPI')
      vi.mocked(named1.fetchAddress).mockResolvedValue(err(busy))
      vi.mocked(named2.fetchAddress).mockResolvedValue(ok(mockAddress))

      await new ResilientAddressProvider([named1, named2]).fetchAddress('01310100')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'AwesomeAPI', attempt: 1, error: busy }),
        expect.stringContaining('recuperável'),
      )
    })

    it('logs the fatal error that aborted the chain', async () => {
      const named = Object.assign(provider1, { providerName: 'AwesomeAPI' })
      const fatal = new DeadlineExceededError('DEADLINE_EXPIRED')
      vi.mocked(named.fetchAddress).mockResolvedValue(err(fatal))

      await new ResilientAddressProvider([named, provider2]).fetchAddress('01310100')

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'AwesomeAPI', error: fatal }),
        expect.stringContaining('Abortando'),
      )
    })

    it('reports the CEP and the tally when every provider called it invalid', async () => {
      vi.mocked(provider1.fetchAddress).mockResolvedValue(ok(null))
      vi.mocked(provider2.fetchAddress).mockResolvedValue(ok(null))

      await createProvider().fetchAddress('01310100')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ cep: '01310100', notFoundCount: 2, totalProviders: 2 }),
        expect.stringContaining('inválido'),
      )
    })

    it('reports the CEP, provider and error when the chain is exhausted by failures', async () => {
      const named = Object.assign(provider1, { providerName: 'AwesomeAPI' })
      const busy = new ServiceBusyError('AwesomeAPI')
      vi.mocked(named.fetchAddress).mockResolvedValue(err(busy))

      await new ResilientAddressProvider([named]).fetchAddress('01310100')

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ cep: '01310100', provider: 'AwesomeAPI', error: busy }),
        expect.stringContaining('erros de sistema'),
      )
    })
  })
})
