/**
 * Prometheus instrumentation of the retention sweep.
 *
 * Separate from `analytics-retention.spec.ts` because the metric registry reads
 * `METRICS_ENABLED` from the environment at MODULE LOAD, so the counters only
 * exist if env is mocked before any import — a constraint that would otherwise
 * force the whole behavioural suite to run behind a hand-built env object.
 *
 * A retention job that silently stops working is indistinguishable from one with
 * nothing to delete: both remove zero rows and log nothing alarming. The counter
 * is the only signal that separates them, which is why CLAUDE.md requires a job
 * handler to prove its counter moved rather than merely to declare one.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@env/index', () => ({
  env: {
    METRICS_ENABLED: true,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ANALYTICS_RETENTION_EVENTS_DAYS: 425,
    ANALYTICS_RETENTION_SESSIONS_DAYS: 425,
    ANALYTICS_RETENTION_VISITORS_DAYS: 395,
  },
}))

const { lockMock } = vi.hoisted(() => ({ lockMock: vi.fn() }))

vi.mock('@lib/infra/distributed-lock/with-distributed-lock', () => ({
  withDistributedLock: lockMock,
}))

import type { Metric } from 'prom-client'
import { InMemoryAnalyticsRepository } from '@repositories/in-memory/in-memory-analytics-repository'
import { AnalyticsRetention } from './analytics-retention'
import {
  collectMetricsAnalyticsRetentionDeleted,
  collectMetricsAnalyticsRetentionRuns,
} from '@lib/metrics/analytics-metrics'

async function metricValue(metric: Metric | null, labels: Record<string, string> = {}): Promise<number> {
  if (!metric) return 0

  const data = await (
    metric as unknown as {
      get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string> }> }>
    }
  ).get()

  const match = data.values.find((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))

  return match?.value ?? 0
}

let repository: InMemoryAnalyticsRepository
let retention: AnalyticsRetention

async function seedExpired(eventCount: number) {
  const ancient = new Date('2000-01-01T00:00:00Z')

  await repository.upsertVisitor({ visitorId: 'visitor-1' })
  await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })

  for (let i = 0; i < eventCount; i++) {
    await repository.createEvent({ sessionId: 'session-1', eventType: 'click', path: `/a/${i}` })
  }

  repository.visitors[0].lastSeenAt = ancient
  repository.sessions[0].startedAt = ancient
  repository.events.forEach((event) => {
    event.occurredAt = ancient
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  lockMock.mockImplementation(async (params: { work: (r: () => Promise<void>) => Promise<void> }) => {
    await params.work(async () => undefined)
  })
  repository = new InMemoryAnalyticsRepository()
  retention = new AnalyticsRetention(repository)
})

describe('AnalyticsRetention — Prometheus counters', () => {
  it('is instrumented at all', () => {
    expect(collectMetricsAnalyticsRetentionDeleted).not.toBeNull()
    expect(collectMetricsAnalyticsRetentionRuns).not.toBeNull()
  })

  it('counts every run, including one that deletes nothing', async () => {
    const before = await metricValue(collectMetricsAnalyticsRetentionRuns)

    await retention.purgeExpiredData()

    expect(await metricValue(collectMetricsAnalyticsRetentionRuns)).toBe(before + 1)
  })

  it('counts deleted events under their own table label', async () => {
    await seedExpired(3)
    const before = await metricValue(collectMetricsAnalyticsRetentionDeleted, { table: 'analytics_events' })

    await retention.purgeExpiredData()

    expect(await metricValue(collectMetricsAnalyticsRetentionDeleted, { table: 'analytics_events' })).toBe(before + 3)
  })

  it('counts deleted visitors separately from events', async () => {
    await seedExpired(2)
    const before = await metricValue(collectMetricsAnalyticsRetentionDeleted, { table: 'analytics_visitors' })

    await retention.purgeExpiredData()

    // Per-table labels, not one total: "nothing was deleted" and "only visitors
    // were deleted" have to be distinguishable on the dashboard.
    expect(await metricValue(collectMetricsAnalyticsRetentionDeleted, { table: 'analytics_visitors' })).toBe(before + 1)
  })

  it('counts deleted sessions under their own table label', async () => {
    await seedExpired(1)
    const before = await metricValue(collectMetricsAnalyticsRetentionDeleted, { table: 'analytics_sessions' })

    await retention.purgeExpiredData()

    expect(await metricValue(collectMetricsAnalyticsRetentionDeleted, { table: 'analytics_sessions' })).toBe(before + 1)
  })

  it('does not move the deletion counter when nothing expires', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    const before = await metricValue(collectMetricsAnalyticsRetentionDeleted, { table: 'analytics_visitors' })

    await retention.purgeExpiredData()

    expect(await metricValue(collectMetricsAnalyticsRetentionDeleted, { table: 'analytics_visitors' })).toBe(before)
  })
})
