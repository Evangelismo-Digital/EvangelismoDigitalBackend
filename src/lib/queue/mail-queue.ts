import { QUEUE } from 'messages/constants/queue/queue'
import { logger } from '@lib/logger'
import { getRedisForQueue } from '@lib/redis/clients/clients'
import { attachRedisLogger } from '@lib/redis/connections/redis-bullMQ-connection'
import { Queue } from 'bullmq'
import { IOutboxDispatchData } from 'core/contracts/lib/infra/outbox-dispatch-data.interface'
import { WORKER_CONSTANTS } from 'messages/constants/workers/workers'
import { WORKER_LOGS } from 'messages/constants/logs/worker'

let mailQueueInstance: Queue<IOutboxDispatchData> | null = null

export function getMailQueue(): Queue<IOutboxDispatchData> {
  if (!mailQueueInstance) {
    const redisForQueue = getRedisForQueue()

    attachRedisLogger(redisForQueue, QUEUE.NAMES.MAIL)

    mailQueueInstance = new Queue<IOutboxDispatchData>(QUEUE.NAMES.MAIL, {
      connection: redisForQueue,
      defaultJobOptions: {
        attempts: WORKER_CONSTANTS.QUEUE.JOB_ATTEMPTS,
        backoff: {
          type: WORKER_CONSTANTS.QUEUE.BACKOFF_TYPE,
          delay: WORKER_CONSTANTS.QUEUE.BACKOFF_DELAY_MS,
          jitter: WORKER_CONSTANTS.QUEUE.BACKOFF_JITTER,
        },
        removeOnComplete: WORKER_CONSTANTS.MAIL.REMOVE_ON_COMPLETE,
        removeOnFail: WORKER_CONSTANTS.MAIL.REMOVE_ON_FAIL,
      },
    })

    mailQueueInstance.on('error', (err: unknown) => {
      logger.error({ err }, WORKER_LOGS.MAIL_QUEUE_ERROR)
    })
  }

  return mailQueueInstance
}
