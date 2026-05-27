import { QUEUE_NAMES } from 'core/constants/queue/queue'
import { logger } from '@lib/logger'
import { getRedisForQueue } from '@lib/redis/clients/clients'
import { attachRedisLogger } from '@lib/redis/connections/redis-bullMQ-connection'
import { Queue } from 'bullmq'
import { IOutboxDispatchData } from 'core/contracts/lib/infra/outbox-dispatch-data.interface'

const redisForQueue = getRedisForQueue()

attachRedisLogger(redisForQueue, QUEUE_NAMES.MAIL)

export const mailQueue = new Queue<IOutboxDispatchData>(QUEUE_NAMES.MAIL, {
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

mailQueue.on('error', (err: unknown) => {
  logger.error({ err }, '❌ Erro na MailQueue (Producer)')
})
