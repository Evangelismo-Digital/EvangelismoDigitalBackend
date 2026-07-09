import { Worker } from 'bullmq'
import { makeSendEmailUseCase } from '@use-cases/factories/make-send-email-use-case'
import { attachRedisLogger } from '@lib/redis/connections/redis-bullMQ-connection'
import { logger } from '@lib/logger'
import { createWorkerConnection, getRedisCache } from '@lib/redis/clients/clients'
import { IOutboxRepository } from 'core/contracts/repository/outbox-repository.interface'
import { isErr } from 'core/shared/result'
import { JobAlreadyProcessingError } from '@lib/errors/queue/job-already-processing-error'
import { SmtpDispatchError } from '@lib/errors/queue/smtp-dispatch-error'
import { InfrastructureError } from 'errors/infrastructure-error'
import { IOutboxDispatchData } from 'core/contracts/lib/infra/outbox-dispatch-data.interface'
import { QUEUE } from 'messages/constants/queue/queue'
import { REDIS_CONSTANTS } from 'messages/constants/redis/redis'
import { WORKER_CONSTANTS } from 'messages/constants/workers/workers'
import { WORKER_LOGS } from 'messages/constants/logs/worker'

export async function startMailWorker(outboxRepository: IOutboxRepository) {
  const workerConnection = createWorkerConnection()
  attachRedisLogger(workerConnection, 'MailWorker')

  const worker = new Worker<IOutboxDispatchData>(
    QUEUE.NAMES.MAIL,
    async (job) => {
      const { publicId, emails } = job.data
      const childLogger = logger.child({ jobId: job.id, publicId })
      const redisCache = getRedisCache()

      const idempotencyKey = `${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`

      const acquired = await redisCache.set(
        idempotencyKey,
        'processing',
        'EX',
        WORKER_CONSTANTS.IDEMPOTENCY_TTL.PROCESSING_SECONDS,
        'NX',
      )

      if (!acquired) {
        const status = await redisCache.get(idempotencyKey)

        if (status === 'completed') {
          childLogger.warn(WORKER_LOGS.BATCH_ALREADY_SENT)

          const deleteResult = await outboxRepository.delete(publicId)
          if (isErr(deleteResult)) {
            // Lançamos a falha do BD para o BullMQ tentar deletar no próximo ciclo
            throw deleteResult.error
          }
          return
        }

        throw new JobAlreadyProcessingError()
      }

      try {
        childLogger.info(`Processando lote de ${emails.length} e-mails...`)

        const sendEmailUseCase = makeSendEmailUseCase()
        const results = await Promise.all(emails.map((email) => sendEmailUseCase.execute(email)))

        const failedResult = results.find((r) => isErr(r))
        if (failedResult && isErr(failedResult)) {
          throw failedResult.error
        }

        childLogger.info('Lote de e-mails processado com sucesso.')

        await redisCache.set(idempotencyKey, 'completed', 'EX', WORKER_CONSTANTS.IDEMPOTENCY_TTL.COMPLETED_SECONDS)

        const deleteResult = await outboxRepository.delete(publicId)

        if (isErr(deleteResult)) {
          // Ocorreu um erro no DB (ex: rede caiu). O mapper já converteu para InfraError.
          throw deleteResult.error
        }

        childLogger.info('OutboxEvent deletado com sucesso do banco de dados')
      } catch (err) {
        await redisCache.del(idempotencyKey)

        // Se o erro foi lançado pela deleção do BD, apenas repassamos.
        if (err instanceof InfrastructureError) {
          throw err
        }

        // Caso contrário, é um erro do serviço de email
        throw new SmtpDispatchError(err)
      }
    },
    {
      connection: workerConnection,
      concurrency: WORKER_CONSTANTS.MAIL.CONCURRENCY_LIMIT,
      lockDuration: WORKER_CONSTANTS.MAIL.LOCK_DURATION_MS,
      stalledInterval: WORKER_CONSTANTS.MAIL.STALLED_INTERVAL_MS,
    },
  )

  worker.on('failed', (job, err) => {
    if (err.message.includes('Missing lock') || err.message.includes('job stalled')) {
      logger.warn({ jobId: job?.id }, WORKER_LOGS.BULLMQ_NETWORK_GLITCH)
      return
    }

    const isInfrastructureError = 'body' in err && 'statusCode' in err

    if (isInfrastructureError) {
      const infraError = err as unknown as InfrastructureError
      logger.error(
        {
          jobId: job?.id,
          code: infraError.body.code,
          cause: infraError.cause,
        },
        `Falha de Infraestrutura: ${infraError.message}`,
      )
      return
    }

    logger.error({ jobId: job?.id, err: err.message }, WORKER_LOGS.GENERIC_WORKER_FAILURE)
  })

  return worker
}
