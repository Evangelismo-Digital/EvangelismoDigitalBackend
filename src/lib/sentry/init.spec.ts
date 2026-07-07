import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockSentryInit, mockNodeProfilingIntegration } = vi.hoisted(() => {
  const mockSentryInit = vi.fn()
  const mockNodeProfilingIntegration = vi.fn(() => 'profiling-integration')

  return { mockSentryInit, mockNodeProfilingIntegration }
})

vi.mock('@sentry/node', () => ({
  init: mockSentryInit,
}))

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: mockNodeProfilingIntegration,
}))

vi.mock('@env/index', () => ({
  env: {
    NODE_ENV: 'production',
    SENTRY_DSN: 'https://fake@sentry.io/123',
    SENTRY_TRACES_SAMPLE_RATE: 0.5,
    SENTRY_PROFILE_SAMPLE_RATE: 0.3,
  },
}))

import { initSentry } from './init'

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes Sentry when SENTRY_DSN is present', () => {
    initSentry()

    expect(mockSentryInit).toHaveBeenCalledOnce()
    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://fake@sentry.io/123',
        environment: 'production',
        tracesSampleRate: 0.5,
        profileSessionSampleRate: 0.3,
        profileLifecycle: 'trace',
      }),
    )
    expect(mockNodeProfilingIntegration).toHaveBeenCalledOnce()
  })
})

describe('initSentry (no DSN)', () => {
  it('does not initialize Sentry when SENTRY_DSN is absent', async () => {
    vi.resetModules()

    vi.doMock('@sentry/node', () => ({
      init: mockSentryInit,
    }))

    vi.doMock('@sentry/profiling-node', () => ({
      nodeProfilingIntegration: mockNodeProfilingIntegration,
    }))

    vi.doMock('@env/index', () => ({
      env: {
        NODE_ENV: 'production',
        SENTRY_DSN: undefined,
        SENTRY_TRACES_SAMPLE_RATE: 0.2,
        SENTRY_PROFILE_SAMPLE_RATE: 0.1,
      },
    }))

    // @ts-expect-error — Dynamic import after vi.resetModules() is unresolvable by tsc but works at runtime via vite-tsconfig-paths
    const { initSentry: initSentryNoDsn } = await import('@lib/sentry/init')

    mockSentryInit.mockClear()

    initSentryNoDsn()

    expect(mockSentryInit).not.toHaveBeenCalled()
  })
})
