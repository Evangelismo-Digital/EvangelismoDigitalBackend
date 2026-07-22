import { Gauge } from 'prom-client'
import { Queue } from 'bullmq'
import { getRegistry } from './index'

const registry = getRegistry()

export const collectMetricsBullmqJobs = registry
  ? new Gauge({
      name: 'bullmq_jobs',
      help: 'Current job count by state',
      labelNames: ['queue', 'state'],
      registers: [registry],
    })
  : null

// Registry of queues to collect metrics from. Populated by the worker at
// startup; empty on the API process (which produces no queues), so
// collectBullMQMetrics() is a no-op there.
const queues: Map<string, Queue> = new Map()

export function registerQueue(name: string, queue: Queue): void {
  queues.set(name, queue)
}

export function unregisterQueue(name: string): void {
  queues.delete(name)
}

// Called lazily on each Prometheus scrape (from metrics-server.ts). No timers:
// job counts are pulled from Redis only when someone actually scrapes /metrics.
export async function collectBullMQMetrics(): Promise<void> {
  if (!collectMetricsBullmqJobs) return

  for (const [name, queue] of queues) {
    const counts = await queue.getJobCounts()

    for (const [state, count] of Object.entries(counts)) {
      collectMetricsBullmqJobs.set({ queue: name, state }, count)
    }
  }
}
