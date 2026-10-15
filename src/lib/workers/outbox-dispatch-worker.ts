import { Job, Worker } from 'bullmq'
import { QUEUE } from 'messages/constants/queue/queue'
import { WORKER_CONSTANTS } from 'messages/constants/workers/workers'
import { createWorkerConnection } from '@lib/redis/clients/clients'
import { attachRedisLogger } from '@lib/redis/connections/redis-bullMQ-connection'
import { OutboxProcessor } from '@lib/infra/jobs/outbox-processor'
import { IOutboxEventJobData } from 'core/contracts/lib/infra/outbox-event-job-data.interface'
import { logger } from '@lib/logger'
import { captureError } from '@lib/sentry/capture'

export function createOutboxDispatchJobProcessor(processor: OutboxProcessor) {
  return async (job: Job<IOutboxEventJobData>): Promise<void> => {
    try {
      await processor.processSingleEvent(job.data.event)
    } catch (error) {
      logger.error({ jobId: job.id, publicId: job.data.publicId, error }, 'Falha no processamento do evento de outbox')
      captureError(error, { jobId: job.id, publicId: job.data.publicId })
      throw error
    }
  }
}

export function startOutboxDispatchWorker(processor: OutboxProcessor): Worker<IOutboxEventJobData> {
  const workerConnection = createWorkerConnection()
  attachRedisLogger(workerConnection, 'OutboxDispatchWorker')

  return new Worker<IOutboxEventJobData>(QUEUE.NAMES.OUTBOX_DISPATCH, createOutboxDispatchJobProcessor(processor), {
    connection: workerConnection,
    concurrency: WORKER_CONSTANTS.OUTBOX_DISPATCH.CONCURRENCY_LIMIT,
    lockDuration: WORKER_CONSTANTS.OUTBOX_DISPATCH.LOCK_DURATION_MS,
    stalledInterval: WORKER_CONSTANTS.OUTBOX_DISPATCH.STALLED_INTERVAL_MS,
  })
}
