import { describe, expect, it, vi } from 'vitest'
import { Registry } from 'prom-client'

vi.mock('@env/index', () => ({
  env: {
    METRICS_ENABLED: true,
  },
}))

import { getRegistry, isMetricsEnabled } from './index'

describe('getRegistry', () => {
  it('returns a Registry instance when METRICS_ENABLED=true', () => {
    const registry = getRegistry()

    expect(registry).toBeInstanceOf(Registry)
  })

  it('returns the same singleton instance on repeated calls', () => {
    const first = getRegistry()
    const second = getRegistry()

    expect(first).toBe(second)
  })

  it('collects Node.js default metrics on the registry', async () => {
    const registry = getRegistry()
    const metrics = await registry!.metrics()

    expect(metrics).toContain('process_cpu_user_seconds_total')
  })
})

describe('isMetricsEnabled', () => {
  it('reflects env.METRICS_ENABLED=true', () => {
    expect(isMetricsEnabled()).toBe(true)
  })
})

describe('getRegistry (disabled)', () => {
  it('returns null when METRICS_ENABLED=false', async () => {
    vi.resetModules()

    vi.doMock('@env/index', () => ({
      env: {
        METRICS_ENABLED: false,
      },
    }))

    // @ts-expect-error — Dynamic import after vi.resetModules() is unresolvable by tsc but works at runtime via vite-tsconfig-paths
    const { getRegistry: getRegistryDisabled, isMetricsEnabled: isMetricsEnabledDisabled } =
      await import('@lib/metrics')

    expect(getRegistryDisabled()).toBeNull()
    expect(isMetricsEnabledDisabled()).toBe(false)
  })
})
