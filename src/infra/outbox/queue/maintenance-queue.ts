import { QUEUE } from '@common/messages/constants/queue/queue'
import { logger } from '@infra/logger'
import { getRedisForQueue } from '@infra/redis/clients/clients'
import { attachRedisLogger } from '@infra/redis/connections/redis-bullMQ-connection'
import { Queue } from 'bullmq'
import { WORKER_CONSTANTS } from '@common/messages/constants/workers/workers'
import { OUTBOX_LOGS } from '@common/messages/constants/logs/outbox'
import { IMaintenanceJobData } from '@infra/outbox/interfaces/maintenance-job-data.interface'

let maintenanceQueueInstance: Queue<IMaintenanceJobData> | null = null

export function getMaintenanceQueue(): Queue<IMaintenanceJobData> {
  if (!maintenanceQueueInstance) {
    const redisForQueue = getRedisForQueue()

    attachRedisLogger(redisForQueue, QUEUE.NAMES.MAINTENANCE)

    maintenanceQueueInstance = new Queue<IMaintenanceJobData>(QUEUE.NAMES.MAINTENANCE, {
      connection: redisForQueue,
      defaultJobOptions: {
        attempts: WORKER_CONSTANTS.QUEUE.JOB_ATTEMPTS,
        backoff: {
          type: WORKER_CONSTANTS.QUEUE.BACKOFF_TYPE,
          delay: WORKER_CONSTANTS.QUEUE.BACKOFF_DELAY_MS,
        },
        removeOnComplete: true,
        removeOnFail: true,
      },
    })

    maintenanceQueueInstance.on('error', (err: unknown) => {
      logger.error({ err }, OUTBOX_LOGS.MAINTENANCE_QUEUE_ERROR)
    })
  }

  return maintenanceQueueInstance
}
