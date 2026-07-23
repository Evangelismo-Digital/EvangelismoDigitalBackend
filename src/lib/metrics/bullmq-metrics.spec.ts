import { vi, describe, it, expect, beforeEach } from 'vitest'

// Habilita métricas: o registry lê env de '@env/index'.
vi.mock('@env/index', () => ({
  env: {
    METRICS_ENABLED: true,
  },
}))

import type { Queue } from 'bullmq'
import type { Gauge } from 'prom-client'
import { getRegistry } from './index'
import { collectMetricsBullmqJobs, registerQueue, unregisterQueue, collectBullMQMetrics } from './bullmq-metrics'

async function gaugeValue(metric: Gauge | null, labels: Record<string, string>): Promise<number | undefined> {
  if (!metric) return undefined
  const data = await metric.get()
  const match = data.values.find((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))
  return match?.value
}

function fakeQueue(getJobCounts: () => Promise<Record<string, number>>): Queue {
  return { getJobCounts } as unknown as Queue
}

describe('BullMQ metrics collection', () => {
  beforeEach(() => {
    getRegistry()?.resetMetrics()
    unregisterQueue('mail-queue')
  })

  it('sets bullmq_jobs gauge per state from a registered queue', async () => {
    registerQueue(
      'mail-queue',
      fakeQueue(async () => ({ waiting: 2, active: 1, failed: 3 })),
    )

    await collectBullMQMetrics()

    expect(await gaugeValue(collectMetricsBullmqJobs, { queue: 'mail-queue', state: 'waiting' })).toBe(2)
    expect(await gaugeValue(collectMetricsBullmqJobs, { queue: 'mail-queue', state: 'active' })).toBe(1)
    expect(await gaugeValue(collectMetricsBullmqJobs, { queue: 'mail-queue', state: 'failed' })).toBe(3)
  })

  it('stops collecting a queue after it is unregistered', async () => {
    const getJobCounts = vi.fn(async () => ({ waiting: 5 }))
    registerQueue('mail-queue', fakeQueue(getJobCounts))

    await collectBullMQMetrics()
    expect(getJobCounts).toHaveBeenCalledTimes(1)

    unregisterQueue('mail-queue')
    await collectBullMQMetrics()

    expect(getJobCounts).toHaveBeenCalledTimes(1)
  })
})

describe('BullMQ metrics (disabled)', () => {
  it('exports a null gauge and no-ops without touching the queue when METRICS_ENABLED=false', async () => {
    vi.resetModules()

    vi.doMock('@env/index', () => ({
      env: {
        METRICS_ENABLED: false,
      },
    }))

    const {
      collectMetricsBullmqJobs: bullmqJobsDisabled,
      registerQueue: registerQueueDisabled,
      collectBullMQMetrics: collectBullMQMetricsDisabled,
    } = await import('./bullmq-metrics.js')

    const getJobCounts = vi.fn(async () => ({ waiting: 1 }))
    registerQueueDisabled('mail-queue', { getJobCounts } as unknown as Queue)

    await collectBullMQMetricsDisabled()

    expect(bullmqJobsDisabled).toBeNull()
    expect(getJobCounts).not.toHaveBeenCalled()
  })
})
