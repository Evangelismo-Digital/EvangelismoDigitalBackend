import { QUEUE } from 'messages/constants/queue/queue'
import { logger } from '@lib/logger'
import { getRedisForQueue } from '@lib/redis/clients/clients'
import { attachRedisLogger } from '@lib/redis/connections/redis-bullMQ-connection'
import { Queue } from 'bullmq'
import { IOutboxDispatchData } from 'core/contracts/lib/infra/outbox-dispatch-data.interface'
import { WORKER_LOGS } from 'messages/constants/logs/worker'

let mailQueueInstance: Queue<IOutboxDispatchData> | null = null

export function getMailQueue(): Queue<IOutboxDispatchData> {
  if (!mailQueueInstance) {
    const redisForQueue = getRedisForQueue()

    attachRedisLogger(redisForQueue, QUEUE.NAMES.MAIL)

    mailQueueInstance = new Queue<IOutboxDispatchData>(QUEUE.NAMES.MAIL, {
      connection: redisForQueue,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: true,
        removeOnFail: true,
      },
    })

    mailQueueInstance.on('error', (err: unknown) => {
      logger.error({ err }, WORKER_LOGS.MAIL_QUEUE_ERROR)
    })
  }

  return mailQueueInstance
}
