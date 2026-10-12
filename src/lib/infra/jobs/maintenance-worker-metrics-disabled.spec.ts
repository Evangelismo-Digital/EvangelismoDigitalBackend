/**
 * Com `METRICS_ENABLED=false` não há registry, e os módulos de métrica exportam
 * `null` em vez de contadores. Todo ponto de instrumentação usa `?.` por causa
 * disso — este spec existe para que o `?.` seja uma garantia testada e não uma
 * suposição: sem ele, desligar métricas derrubaria a manutenção inteira com
 * "Cannot read properties of null".
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@lib/sentry/capture', () => ({ captureError: vi.fn() }))

// Registry ausente: é exatamente o que `getRegistry()` devolve sem métricas.
vi.mock('@lib/metrics/outbox-metrics', () => ({
  collectMetricsOutboxCronRuns: null,
  collectMetricsOutboxCronFailures: null,
}))

import { createMaintenanceJobProcessor, MaintenanceDeps } from './maintenance-worker'
import { QUEUE } from 'messages/constants/queue/queue'
import type { Job } from 'bullmq'
import type { IMaintenanceJobData } from 'core/contracts/lib/infra/maintenance-job-data.interface'

function makeDeps() {
  return {
    processor: {
      processStuckSendingEvents: vi.fn().mockResolvedValue(undefined),
      processPendingEvents: vi.fn().mockResolvedValue(undefined),
    },
    maintenance: {
      sweepExpiredEvents: vi.fn().mockResolvedValue(undefined),
      purgeOldEvents: vi.fn().mockResolvedValue(undefined),
    },
    analyticsRetention: { purgeExpiredData: vi.fn().mockResolvedValue(undefined) },
  }
}

function makeJob(name: string, attemptsMade = 0, attempts = 3): Job<IMaintenanceJobData> {
  return { id: 'job-1', name, data: {}, attemptsMade, opts: { attempts } } as unknown as Job<IMaintenanceJobData>
}

describe('manutenção com métricas desligadas', () => {
  let deps: ReturnType<typeof makeDeps>
  let process: ReturnType<typeof createMaintenanceJobProcessor>

  beforeEach(() => {
    vi.clearAllMocks()
    deps = makeDeps()
    process = createMaintenanceJobProcessor(deps as unknown as MaintenanceDeps)
  })

  it('o caminho de sucesso roda normalmente sem contador de execuções', async () => {
    await expect(process(makeJob(QUEUE.JOBS.FIVE_MIN_SWEEP))).resolves.toBeUndefined()

    expect(deps.maintenance.sweepExpiredEvents).toHaveBeenCalledOnce()
    expect(deps.processor.processPendingEvents).toHaveBeenCalledOnce()
  })

  it('a falha retentável ainda lança para o BullMQ, sem contador de falhas', async () => {
    const failure = new Error('falha transitória')
    deps.maintenance.purgeOldEvents.mockRejectedValue(failure)

    await expect(process(makeJob(QUEUE.JOBS.RETENTION_PURGE, 0))).rejects.toThrow(failure)
  })

  it('a falha terminal ainda é engolida, sem contador de falhas', async () => {
    deps.analyticsRetention.purgeExpiredData.mockRejectedValue(new Error('falha final'))

    await expect(process(makeJob(QUEUE.JOBS.ANALYTICS_RETENTION, 2))).resolves.toBeUndefined()
  })
})
