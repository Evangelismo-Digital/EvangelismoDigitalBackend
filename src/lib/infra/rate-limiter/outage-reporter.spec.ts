import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { logger } from '@lib/logger'
import { asLoggableError, DEFAULT_OUTAGE_WARN_INTERVAL_MS, OutageReporter } from './outage-reporter'

const MESSAGES = {
  degraded: 'degradado',
  stillDegraded: 'ainda degradado',
  recovered: 'restabelecido',
}

const WARN_INTERVAL_MS = 30_000

function makeReporter(overrides: { onDegraded?: () => void; onRecovered?: () => void } = {}) {
  return new OutageReporter({
    messages: MESSAGES,
    warnIntervalMs: WARN_INTERVAL_MS,
    ...overrides,
  })
}

describe('OutageReporter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('opening an episode', () => {
    it('warns once, with the failure attached, on the first degraded request', () => {
      const reporter = makeReporter()

      reporter.failed({ provider: 'viacep' }, { message: 'Connection Lost' })

      expect(logger.warn).toHaveBeenCalledOnce()
      expect(logger.warn).toHaveBeenCalledWith(
        { provider: 'viacep', mode: 'fail-open', redisOutage: true, err: { message: 'Connection Lost' } },
        MESSAGES.degraded,
      )
    })

    it('reports itself degraded only while an episode is open', () => {
      const reporter = makeReporter()
      expect(reporter.degraded).toBe(false)

      reporter.failed({ provider: 'viacep' }, {})
      expect(reporter.degraded).toBe(true)

      reporter.succeeded({ provider: 'viacep' })
      expect(reporter.degraded).toBe(false)
    })
  })

  describe('throttling a continuing episode', () => {
    it('suppresses repeat warnings inside the interval', () => {
      const reporter = makeReporter()

      reporter.failed({ provider: 'viacep' }, {})
      vi.advanceTimersByTime(WARN_INTERVAL_MS - 1)
      reporter.failed({ provider: 'viacep' }, {})
      reporter.failed({ provider: 'viacep' }, {})

      expect(logger.warn).toHaveBeenCalledOnce()
    })

    it('warns again once the interval has passed, reporting duration and what it swallowed', () => {
      const reporter = makeReporter()

      reporter.failed({ provider: 'viacep' }, {})
      vi.advanceTimersByTime(1_000)
      reporter.failed({ provider: 'viacep' }, {})
      reporter.failed({ provider: 'viacep' }, {})
      vi.advanceTimersByTime(WARN_INTERVAL_MS)
      reporter.failed({ provider: 'viacep' }, { message: 'still down' })

      expect(logger.warn).toHaveBeenCalledTimes(2)
      expect(logger.warn).toHaveBeenLastCalledWith(
        expect.objectContaining({
          provider: 'viacep',
          mode: 'fail-open',
          redisOutage: true,
          outageDurationMs: WARN_INTERVAL_MS + 1_000,
          suppressedLogs: 2,
          err: { message: 'still down' },
        }),
        MESSAGES.stillDegraded,
      )
    })

    it('starts counting suppressed logs again after each reminder', () => {
      const reporter = makeReporter()

      reporter.failed({ provider: 'viacep' }, {})
      reporter.failed({ provider: 'viacep' }, {})
      vi.advanceTimersByTime(WARN_INTERVAL_MS)
      reporter.failed({ provider: 'viacep' }, {})
      vi.advanceTimersByTime(WARN_INTERVAL_MS)
      reporter.failed({ provider: 'viacep' }, {})

      expect(logger.warn).toHaveBeenLastCalledWith(
        expect.objectContaining({ suppressedLogs: 0 }),
        MESSAGES.stillDegraded,
      )
    })
  })

  describe('closing an episode', () => {
    it('logs the recovery once, with how long it lasted', () => {
      const reporter = makeReporter()

      reporter.failed({ provider: 'viacep' }, {})
      vi.advanceTimersByTime(5_000)
      reporter.succeeded({ provider: 'viacep' })

      expect(logger.info).toHaveBeenCalledOnce()
      expect(logger.info).toHaveBeenCalledWith(
        { provider: 'viacep', outageDurationMs: 5_000, suppressedLogs: 0 },
        MESSAGES.recovered,
      )
    })

    it('says nothing when a healthy reporter succeeds', () => {
      const reporter = makeReporter()

      reporter.succeeded({ provider: 'viacep' })

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('does not repeat the recovery on every subsequent success', () => {
      const reporter = makeReporter()

      reporter.failed({ provider: 'viacep' }, {})
      reporter.succeeded({ provider: 'viacep' })
      reporter.succeeded({ provider: 'viacep' })

      expect(logger.info).toHaveBeenCalledOnce()
    })

    it('opens a fresh episode after a recovery instead of resuming the old one', () => {
      const reporter = makeReporter()

      reporter.failed({ provider: 'viacep' }, {})
      reporter.succeeded({ provider: 'viacep' })
      reporter.failed({ provider: 'viacep' }, {})

      expect(logger.warn).toHaveBeenCalledTimes(2)
      expect(logger.warn).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'fail-open' }), MESSAGES.degraded)
    })
  })

  describe('the callbacks', () => {
    it('fires onDegraded for every degraded request, including the suppressed ones', () => {
      const onDegraded = vi.fn()
      const reporter = makeReporter({ onDegraded })

      reporter.failed({ provider: 'viacep' }, {})
      reporter.failed({ provider: 'viacep' }, {})
      reporter.failed({ provider: 'viacep' }, {})

      expect(onDegraded).toHaveBeenCalledTimes(3)
      expect(logger.warn).toHaveBeenCalledOnce()
      expect(onDegraded).toHaveBeenCalledWith({ provider: 'viacep' })
    })

    it('fires onRecovered once per episode, not once per success', () => {
      const onRecovered = vi.fn()
      const reporter = makeReporter({ onRecovered })

      reporter.succeeded({ provider: 'viacep' })
      expect(onRecovered).not.toHaveBeenCalled()

      reporter.failed({ provider: 'viacep' }, {})
      reporter.succeeded({ provider: 'viacep' })
      reporter.succeeded({ provider: 'viacep' })

      expect(onRecovered).toHaveBeenCalledOnce()
    })
  })

  describe('reset', () => {
    it('drops an open episode silently, so teardown does not log a recovery', () => {
      const onRecovered = vi.fn()
      const reporter = makeReporter({ onRecovered })

      reporter.failed({ provider: 'viacep' }, {})
      reporter.reset()

      expect(reporter.degraded).toBe(false)
      expect(onRecovered).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('the default warn interval', () => {
    it('is used when the caller does not pick one', () => {
      const reporter = new OutageReporter({ messages: MESSAGES })

      reporter.failed({ provider: 'viacep' }, {})
      vi.advanceTimersByTime(DEFAULT_OUTAGE_WARN_INTERVAL_MS - 1)
      reporter.failed({ provider: 'viacep' }, {})
      expect(logger.warn).toHaveBeenCalledOnce()

      vi.advanceTimersByTime(1)
      reporter.failed({ provider: 'viacep' }, {})
      expect(logger.warn).toHaveBeenCalledTimes(2)
    })
  })

  describe('asLoggableError', () => {
    it('passes an object rejection through untouched', () => {
      const error = new Error('boom')

      expect(asLoggableError(error)).toBe(error)
    })

    it.each([
      ['a string', 'a bare string'],
      ['a number', 42],
      ['undefined', undefined],
    ])('wraps %s so the thrown value survives into the log', (_label, thrown) => {
      expect(asLoggableError(thrown)).toEqual({ error: thrown })
    })

    it('does not treat null as an object', () => {
      expect(asLoggableError(null)).toEqual({ error: null })
    })
  })
})
