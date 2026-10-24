import { Job, Worker } from 'bullmq'
import { QUEUE } from '@common/messages/constants/queue/queue'
import { WORKER_CONSTANTS } from '@common/messages/constants/workers/workers'
import { createWorkerConnection } from '@infra/redis/clients/clients'
import { attachRedisLogger } from '@infra/redis/connections/redis-bullMQ-connection'
import { OutboxProcessor } from '@infra/outbox/jobs/outbox-processor'
import { IOutboxEventJobData } from '@infra/outbox/interfaces/outbox-event-job-data.interface'
import { logger } from '@infra/logger'
import { captureError } from '@infra/sentry/capture'

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
