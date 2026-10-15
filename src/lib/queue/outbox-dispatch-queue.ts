import { QUEUE } from 'messages/constants/queue/queue'
import { logger } from '@lib/logger'
import { getRedisForQueue } from '@lib/redis/clients/clients'
import { attachRedisLogger } from '@lib/redis/connections/redis-bullMQ-connection'
import { Queue } from 'bullmq'
import { IOutboxEventJobData } from 'core/contracts/lib/infra/outbox-event-job-data.interface'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import {
  collectMetricsOutboxDispatchEnqueued,
  collectMetricsOutboxDispatchEnqueueFailed,
} from '@lib/metrics/outbox-metrics'
import { WORKER_LOGS } from 'messages/constants/logs/worker'

let outboxDispatchQueueInstance: Queue<IOutboxEventJobData> | null = null

export function getOutboxDispatchQueue(): Queue<IOutboxEventJobData> {
  if (!outboxDispatchQueueInstance) {
    const redisForQueue = getRedisForQueue()

    attachRedisLogger(redisForQueue, QUEUE.NAMES.OUTBOX_DISPATCH)

    outboxDispatchQueueInstance = new Queue<IOutboxEventJobData>(QUEUE.NAMES.OUTBOX_DISPATCH, {
      connection: redisForQueue,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: true,
      },
    })

    outboxDispatchQueueInstance.on('error', (err: unknown) => {
      logger.error({ err }, WORKER_LOGS.OUTBOX_DISPATCH_QUEUE_ERROR)
    })
  }

  return outboxDispatchQueueInstance
}

export async function enqueueOutboxDispatch(event: IOutboxEvent): Promise<void> {
  try {
    const queue = getOutboxDispatchQueue()
    await queue.add(
      QUEUE.JOBS.OUTBOX_DISPATCH,
      { publicId: event.publicId, event },
      {
        jobId: event.publicId,
      },
    )
    collectMetricsOutboxDispatchEnqueued?.inc()
  } catch (err) {
    collectMetricsOutboxDispatchEnqueueFailed?.inc()
    logger.warn({ err, publicId: event.publicId }, 'Falha ao enfileirar evento de outbox na fila outbox-dispatch')
  }
}

export async function closeOutboxDispatchQueue(): Promise<void> {
  if (outboxDispatchQueueInstance) {
    const queue = outboxDispatchQueueInstance
    outboxDispatchQueueInstance = null
    await queue.close()
  }
}
