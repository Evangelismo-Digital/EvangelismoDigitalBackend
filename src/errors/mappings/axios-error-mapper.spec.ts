import { describe, it, expect } from 'vitest'
import { AxiosError } from 'axios'
import {
  resolveAddressProviderError,
  resolveGeoProviderError,
  resolveRoutingProviderError,
} from './axios-error-mapper'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'

function createFakeAxiosError(status?: number, code?: string): AxiosError {
  return {
    name: 'AxiosError',
    message: 'Axios error occurred',
    isAxiosError: true,
    code,
    response: status !== undefined ? {
      status,
      data: {},
      statusText: 'Error',
      headers: {},
      config: {} as any,
    } : undefined,
    config: {} as any,
    toJSON: () => ({}),
  } as AxiosError
}

describe('AxiosErrorMapper', () => {
  const providerName = 'MockProvider'
  const originalError = new Error('Original error context')

  describe('resolveAddressProviderError', () => {
    it('maps 404 to InvalidCepError with shouldRetry: false', () => {
      const err = createFakeAxiosError(404)
      const res = resolveAddressProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(InvalidCepError)
      expect(res.shouldRetry).toBe(false)
    })

    it('maps 429 to ServiceBusyError with shouldRetry: false', () => {
      const err = createFakeAxiosError(429)
      const res = resolveAddressProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(ServiceBusyError)
      expect(res.shouldRetry).toBe(false)
    })

    it('maps 500 to ProviderFailureError with shouldRetry: true', () => {
      const err = createFakeAxiosError(500)
      const res = resolveAddressProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(ProviderFailureError)
      expect(res.shouldRetry).toBe(true)
    })

    it('maps network errors (no response) to ProviderFailureError with shouldRetry: true', () => {
      const err = createFakeAxiosError(undefined)
      const res = resolveAddressProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(ProviderFailureError)
      expect(res.shouldRetry).toBe(true)
    })

    it('maps 403 to ProviderFailureError with shouldRetry: false', () => {
      const err = createFakeAxiosError(403)
      const res = resolveAddressProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(ProviderFailureError)
      expect(res.shouldRetry).toBe(false)
    })
  })

  describe('resolveGeoProviderError', () => {
    it('maps 404 to CoordinatesNotFoundError with shouldRetry: false', () => {
      const err = createFakeAxiosError(404)
      const res = resolveGeoProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(CoordinatesNotFoundError)
      expect(res.shouldRetry).toBe(false)
    })

    it('maps 429 to ServiceBusyError with shouldRetry: false', () => {
      const err = createFakeAxiosError(429)
      const res = resolveGeoProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(ServiceBusyError)
      expect(res.shouldRetry).toBe(false)
    })

    it('maps 500 to ProviderFailureError with shouldRetry: true', () => {
      const err = createFakeAxiosError(500)
      const res = resolveGeoProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(ProviderFailureError)
      expect(res.shouldRetry).toBe(true)
    })

    it('maps network errors (no response) to ProviderFailureError with shouldRetry: true', () => {
      const err = createFakeAxiosError(undefined)
      const res = resolveGeoProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(ProviderFailureError)
      expect(res.shouldRetry).toBe(true)
    })

    it('maps 403 to ProviderFailureError with shouldRetry: false', () => {
      const err = createFakeAxiosError(403)
      const res = resolveGeoProviderError(err, { provider: providerName, originalError })
      expect(res.error).toBeInstanceOf(ProviderFailureError)
      expect(res.shouldRetry).toBe(false)
    })
  })

  describe('resolveRoutingProviderError', () => {
    it('maps 429 to ServiceBusyError', () => {
      const err = createFakeAxiosError(429)
      const res = resolveRoutingProviderError(err, { provider: providerName, originalError })
      expect(res).toBeInstanceOf(ServiceBusyError)
    })

    it('maps ERR_CANCELED to TimeoutExceededError', () => {
      const err = createFakeAxiosError(undefined, 'ERR_CANCELED')
      const res = resolveRoutingProviderError(err, { provider: providerName, originalError })
      expect(res).toBeInstanceOf(TimeoutExceededError)
    })

    it('maps other errors to ProviderFailureError', () => {
      const err = createFakeAxiosError(500)
      const res = resolveRoutingProviderError(err, { provider: providerName, originalError })
      expect(res).toBeInstanceOf(ProviderFailureError)
    })
  })
})
