import { Job, Worker } from 'bullmq'
import { makeSendEmailUseCase } from '@use-cases/factories/make-send-email-use-case'
import { attachRedisLogger } from '@lib/redis/connections/redis-bullMQ-connection'
import { logger } from '@lib/logger'
import { createWorkerConnection, getRedisCache } from '@lib/redis/clients/clients'
import { IOutboxRepository, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { isErr } from 'core/shared/result'
import { JobAlreadyProcessingError } from '@lib/errors/queue/job-already-processing-error'
import { SmtpDispatchError } from '@lib/errors/queue/smtp-dispatch-error'
import { InfrastructureError } from 'errors/infrastructure-error'
import { IOutboxDispatchData } from 'core/contracts/lib/infra/outbox-dispatch-data.interface'
import { QUEUE } from 'messages/constants/queue/queue'
import { REDIS_CONSTANTS } from 'messages/constants/redis/redis'
import { WORKER_CONSTANTS } from 'messages/constants/workers/workers'
import { WORKER_LOGS } from 'messages/constants/logs/worker'
import { captureError } from '@lib/sentry/capture'

export function createMailJobProcessor(outboxRepository: IOutboxRepository) {
  return async (job: Job<IOutboxDispatchData>): Promise<void> => {
    const { publicId, emails } = job.data
    const childLogger = logger.child({ jobId: job.id, publicId })
    const redisCache = getRedisCache()

    // Gate de expiração — ANTES da chave de idempotência: um link morto nunca é
    // enviado (ex.: o backoff do retry cruzou a janela do token na fila).
    // Sucesso sem envio; só a falha do delete dispara retry (que re-tenta só o delete).
    if (job.data.expiresAt && new Date(job.data.expiresAt).getTime() <= Date.now()) {
      childLogger.warn(WORKER_LOGS.EXPIRED_JOB_SKIPPED)

      const deleteResult = await outboxRepository.delete(publicId)
      if (isErr(deleteResult)) {
        throw deleteResult.error
      }
      return
    }

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

    // Fase 1: envio dos e-mails. O catch cobre APENAS esta fase — aqui a chave de
    // idempotência ainda vale 'processing', então removê-la para liberar o retry é seguro.
    try {
      childLogger.info(`Processando lote de ${emails.length} e-mails...`)

      const sendEmailUseCase = makeSendEmailUseCase()
      const results = await Promise.allSettled(emails.map((email) => sendEmailUseCase.execute(email)))

      const failures = results.filter((r) => r.status === 'rejected' || isErr(r.value))

      if (failures.length > 0) {
        // Falha parcial: parte do lote foi enviada; o retry reenviará o lote
        // inteiro (duplicata tolerável — e-mail de notificação, não transação)
        if (failures.length < results.length) {
          childLogger.warn(
            { successCount: results.length - failures.length, failureCount: failures.length },
            WORKER_LOGS.PARTIAL_BATCH_FAILURE,
          )
        }

        const firstFailure = failures[0]
        if (firstFailure.status === 'rejected') {
          throw firstFailure.reason
        }
        if (isErr(firstFailure.value)) {
          throw firstFailure.value.error
        }
      }

      childLogger.info('Lote de e-mails processado com sucesso.')

      await redisCache.set(idempotencyKey, 'completed', 'EX', WORKER_CONSTANTS.IDEMPOTENCY_TTL.COMPLETED_SECONDS)
    } catch (err) {
      await redisCache.del(idempotencyKey)

      if (err instanceof InfrastructureError) {
        throw err
      }

      throw new SmtpDispatchError(err)
    }

    // Fase 2: limpeza do outbox. NUNCA remove a chave de idempotência aqui: com
    // 'completed' já gravado, o retry do BullMQ cai no branch de deduplicação acima
    // e apenas re-deleta a linha — sem reenviar e-mails.
    const deleteResult = await outboxRepository.delete(publicId)

    if (isErr(deleteResult)) {
      throw deleteResult.error
    }

    childLogger.info('OutboxEvent deletado com sucesso do banco de dados')
  }
}

export function createJobFailureHandler(outboxRepository: IOutboxRepository) {
  return async (job: Job<IOutboxDispatchData> | undefined, err: Error): Promise<void> => {
    try {
      const message = err.message

      // "job stalled more than allowable limit" é falha definitiva mesmo com tentativas restantes
      const isStalledFinal = message.includes('job stalled more than allowable limit')

      if (!isStalledFinal && (message.includes('Missing lock') || message.includes('job stalled'))) {
        logger.warn({ jobId: job?.id }, WORKER_LOGS.BULLMQ_NETWORK_GLITCH)
        return
      }

      const isFinal = job != null && (isStalledFinal || job.attemptsMade >= (job.opts.attempts ?? 1))
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
      } else {
        logger.error({ jobId: job?.id, err: err.message }, WORKER_LOGS.GENERIC_WORKER_FAILURE)
      }

      // Sentry só recebe falhas terminais (job esgotou tentativas): retries
      // transitórios não devem poluir o Sentry (política "terminal/critical only").
      if (isFinal) {
        captureError(err, { jobId: job?.id, publicId: job?.data?.publicId })
      }

      if (!isFinal) return

      const publicId = job?.data?.publicId
      if (!publicId) return

      // Falha definitiva: reverte para PENDING para que o próximo ciclo da Outbox
      // re-despache. O limite MAX_DISPATCH_ATTEMPTS (processor) impede loop infinito.
      const revertResult = await outboxRepository.updateStatus(publicId, IOutboxEventStatus.PENDING)

      if (isErr(revertResult)) {
        logger.warn(
          { jobId: job?.id, publicId, error: revertResult.error },
          WORKER_LOGS.OUTBOX_REVERT_AFTER_FINAL_FAILURE_ERROR,
        )
        captureError(revertResult.error, { jobId: job?.id, publicId })
        return
      }

      logger.warn({ jobId: job?.id, publicId }, WORKER_LOGS.OUTBOX_REVERTED_AFTER_FINAL_FAILURE)
    } catch (handlerError) {
      // Nunca propaga: uma rejeição aqui viraria unhandledRejection e derrubaria o worker
      logger.error({ jobId: job?.id, err: handlerError }, WORKER_LOGS.FAILURE_HANDLER_ERROR)
      captureError(handlerError, { jobId: job?.id })
    }
  }
}

export async function startMailWorker(outboxRepository: IOutboxRepository) {
  const workerConnection = createWorkerConnection()
  attachRedisLogger(workerConnection, 'MailWorker')

  const worker = new Worker<IOutboxDispatchData>(QUEUE.NAMES.MAIL, createMailJobProcessor(outboxRepository), {
    connection: workerConnection,
    concurrency: WORKER_CONSTANTS.MAIL.CONCURRENCY_LIMIT,
    lockDuration: WORKER_CONSTANTS.MAIL.LOCK_DURATION_MS,
    stalledInterval: WORKER_CONSTANTS.MAIL.STALLED_INTERVAL_MS,
  })

  const handleJobFailure = createJobFailureHandler(outboxRepository)

  worker.on('failed', (job, err) => {
    void handleJobFailure(job, err)
  })

  return worker
}
