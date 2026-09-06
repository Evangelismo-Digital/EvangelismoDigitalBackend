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
import {
  collectMetricsEmailsSent,
  collectMetricsEmailsFailed,
  collectMetricsEmailsSkipped,
  collectMetricsEmailBatchDuration,
} from '@lib/metrics/email-metrics'

type JobLogger = typeof logger
type MailJob = Job<IOutboxDispatchData>
type RedisCache = ReturnType<typeof getRedisCache>

export function createMailJobProcessor(outboxRepository: IOutboxRepository) {
  return async (job: MailJob): Promise<void> => {
    const { publicId } = job.data
    const childLogger = logger.child({ jobId: job.id, publicId })
    const redisCache = getRedisCache()
    const idempotencyKey = `${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`

    if (await discardIfExpired(job, outboxRepository, childLogger)) return
    if (await alreadyHandled(job, outboxRepository, childLogger, redisCache, idempotencyKey)) return

    await sendBatch(job, outboxRepository, childLogger, redisCache, idempotencyKey)

    // Fase 2: limpeza do outbox. NUNCA remove a chave de idempotência aqui: com
    // 'completed' já gravado, o retry do BullMQ cai no branch de deduplicação
    // acima e apenas re-deleta a linha — sem reenviar e-mails.
    const deleteResult = await outboxRepository.delete(publicId)

    if (isErr(deleteResult)) {
      throw deleteResult.error
    }

    childLogger.info('OutboxEvent deletado com sucesso do banco de dados')
  }
}

/**
 * Gate de expiração — ANTES da chave de idempotência: um link morto nunca é
 * enviado (ex.: o backoff do retry cruzou a janela do token na fila). Sucesso
 * sem envio; só a falha do delete dispara retry (que re-tenta só o delete).
 */
async function discardIfExpired(
  job: MailJob,
  outboxRepository: IOutboxRepository,
  childLogger: JobLogger,
): Promise<boolean> {
  if (!job.data.expiresAt || new Date(job.data.expiresAt).getTime() > Date.now()) {
    return false
  }

  childLogger.warn(WORKER_LOGS.EXPIRED_JOB_SKIPPED)

  const deleteResult = await outboxRepository.delete(job.data.publicId)

  if (isErr(deleteResult)) {
    throw deleteResult.error
  }

  // Contabiliza só após o delete: se o delete falhar e o BullMQ re-tentar, o
  // skip não é contado em duplicidade (o job continua expirado no retry).
  collectMetricsEmailsSkipped?.inc({ reason: 'expired' })

  return true
}

/**
 * Reivindica a chave de idempotência. Se outra execução já a detém, decide entre
 * re-deletar a linha (lote já enviado) e devolver o job à fila (em processamento).
 */
async function alreadyHandled(
  job: MailJob,
  outboxRepository: IOutboxRepository,
  childLogger: JobLogger,
  redisCache: RedisCache,
  idempotencyKey: string,
): Promise<boolean> {
  const acquired = await redisCache.set(
    idempotencyKey,
    'processing',
    'EX',
    WORKER_CONSTANTS.IDEMPOTENCY_TTL.PROCESSING_SECONDS,
    'NX',
  )

  if (acquired) {
    return false
  }

  const status = await redisCache.get(idempotencyKey)

  if (status !== 'completed') {
    collectMetricsEmailsSkipped?.inc({ reason: 'processing' })
    throw new JobAlreadyProcessingError()
  }

  childLogger.warn(WORKER_LOGS.BATCH_ALREADY_SENT)

  const deleteResult = await outboxRepository.delete(job.data.publicId)

  if (isErr(deleteResult)) {
    // Lançamos a falha do BD para o BullMQ tentar deletar no próximo ciclo
    throw deleteResult.error
  }

  // Contabiliza só após o delete (mesma razão do gate de expiração).
  collectMetricsEmailsSkipped?.inc({ reason: 'already_sent' })

  return true
}

/**
 * Fase 1: envio dos e-mails. O catch cobre APENAS esta fase — aqui a chave de
 * idempotência ainda vale 'processing', então removê-la para liberar o retry é
 * seguro.
 */
async function sendBatch(
  job: MailJob,
  outboxRepository: IOutboxRepository,
  childLogger: JobLogger,
  redisCache: RedisCache,
  idempotencyKey: string,
): Promise<void> {
  try {
    await dispatchAndEvaluate(job, outboxRepository, childLogger)

    childLogger.info('Lote de e-mails processado com sucesso.')

    await redisCache.set(idempotencyKey, 'completed', 'EX', WORKER_CONSTANTS.IDEMPOTENCY_TTL.COMPLETED_SECONDS)
  } catch (err) {
    await redisCache.del(idempotencyKey)

    if (err instanceof InfrastructureError) {
      throw err
    }

    throw new SmtpDispatchError(err)
  }
}

/** Dispara o lote e traduz o resultado em métricas, retry seletivo ou exceção. */
async function dispatchAndEvaluate(
  job: MailJob,
  outboxRepository: IOutboxRepository,
  childLogger: JobLogger,
): Promise<void> {
  const { emails } = job.data

  childLogger.info(`Processando lote de ${emails.length} e-mails...`)

  const sendEmailUseCase = makeSendEmailUseCase()
  const end = collectMetricsEmailBatchDuration?.startTimer()
  const results = await Promise.allSettled(emails.map((email) => sendEmailUseCase.execute(email)))
  end?.()

  const failures = results.filter((r) => r.status === 'rejected' || isErr(r.value))

  recordSendOutcome(results, failures)

  if (failures.length === 0) {
    return
  }

  if (failures.length < results.length) {
    await persistSelectiveRetry(job, outboxRepository, childLogger, results, failures.length)
  }

  throwFirstFailure(failures)
}

type SendResults = PromiseSettledResult<Awaited<ReturnType<ReturnType<typeof makeSendEmailUseCase>['execute']>>>[]

/**
 * Envios bem-sucedidos desta tentativa. O retry seletivo garante que quem já
 * recebeu não é reenviado, então contabilizar por tentativa não duplica —
 * exceto no caminho degradado (updatePendingRecipients falha → lote inteiro
 * re-tentado), onde o reenvio é real e o re-incremento reflete a realidade.
 */
function recordSendOutcome(results: SendResults, failures: SendResults): void {
  const successCount = results.length - failures.length

  if (successCount > 0) {
    collectMetricsEmailsSent?.inc(successCount)
  }

  // Cada destinatário que falhou é contado com seu próprio tipo (smtp/infra).
  for (const failure of failures) {
    collectMetricsEmailsFailed?.inc({ error_type: causeOf(failure) instanceof InfrastructureError ? 'infra' : 'smtp' })
  }
}

function causeOf(failure: SendResults[number]): unknown {
  if (failure.status === 'rejected') {
    return failure.reason
  }

  return isErr(failure.value) ? failure.value.error : undefined
}

/**
 * Falha parcial: parte do lote foi enviada. Retry seletivo — persiste apenas os
 * destinatários que falharam para que tanto as re-tentativas internas do BullMQ
 * quanto o re-despacho do Outbox não reenviem quem já recebeu.
 *
 * Best-effort: DB primeiro (fonte de verdade do re-despacho do Outbox). Se o DB
 * falhar, mantém o BullMQ com o lote completo para não deixar as camadas
 * inconsistentes — ambas re-tentam o lote inteiro nesse caso.
 */
async function persistSelectiveRetry(
  job: MailJob,
  outboxRepository: IOutboxRepository,
  childLogger: JobLogger,
  results: SendResults,
  failureCount: number,
): Promise<void> {
  const { publicId, emails } = job.data

  // `failures` perde o alinhamento com `emails`; recupera os e-mails que
  // falharam re-filtrando por índice (Promise.allSettled preserva a ordem).
  const failedEmails = emails.filter((_, i) => results[i].status === 'rejected' || isErr(results[i].value))

  childLogger.warn({ successCount: results.length - failureCount, failureCount }, WORKER_LOGS.PARTIAL_BATCH_FAILURE)

  const dbResult = await outboxRepository.updatePendingRecipients(
    publicId,
    failedEmails.map((e) => e.to),
  )

  if (isErr(dbResult)) {
    childLogger.error({ publicId }, WORKER_LOGS.PENDING_RECIPIENTS_UPDATE_FAILED)
    return
  }

  try {
    await job.updateData({ ...job.data, emails: failedEmails })
  } catch {
    childLogger.error({ publicId }, WORKER_LOGS.JOB_DATA_UPDATE_FAILED)
  }
}

function throwFirstFailure(failures: SendResults): void {
  const firstFailure = failures[0]

  if (firstFailure.status === 'rejected') {
    throw firstFailure.reason
  }

  if (isErr(firstFailure.value)) {
    throw firstFailure.value.error
  }
}

export function createJobFailureHandler(outboxRepository: IOutboxRepository) {
  return async (job: MailJob | undefined, err: Error): Promise<void> => {
    await handleJobFailure(job, err, outboxRepository)
  }
}

/** Identificadores do job, resolvidos uma vez — o job pode não existir. */
function jobContext(job: MailJob | undefined): { jobId: string | undefined; publicId: string | undefined } {
  return { jobId: job?.id, publicId: job?.data?.publicId }
}

async function handleJobFailure(
  job: MailJob | undefined,
  err: Error,
  outboxRepository: IOutboxRepository,
): Promise<void> {
  const context = jobContext(job)

  try {
    if (isTransientBullMQGlitch(err)) {
      logger.warn({ jobId: context.jobId }, WORKER_LOGS.BULLMQ_NETWORK_GLITCH)
      return
    }

    logFailure(job, err)

    // Sentry só recebe falhas terminais (job esgotou tentativas): retries
    // transitórios não devem poluir o Sentry (política "terminal/critical only").
    if (!isFinalFailure(job, err)) return

    captureError(err, context)

    await revertForRedispatch(context, outboxRepository)
  } catch (handlerError) {
    // Nunca propaga: uma rejeição aqui viraria unhandledRejection e derrubaria o worker
    logger.error({ jobId: context.jobId, err: handlerError }, WORKER_LOGS.FAILURE_HANDLER_ERROR)
    captureError(handlerError, { jobId: context.jobId })
  }
}

function isFinalFailure(job: MailJob | undefined, err: Error): boolean {
  if (job == null) return false

  return isStalledFinal(err) || job.attemptsMade >= (job.opts.attempts ?? 1)
}

/** "job stalled more than allowable limit" é falha definitiva mesmo com tentativas restantes. */
function isStalledFinal(err: Error): boolean {
  return err.message.includes('job stalled more than allowable limit')
}

function isTransientBullMQGlitch(err: Error): boolean {
  const message = err.message

  return !isStalledFinal(err) && (message.includes('Missing lock') || message.includes('job stalled'))
}

function logFailure(job: MailJob | undefined, err: Error): void {
  const isInfrastructureError = 'body' in err && 'statusCode' in err

  if (!isInfrastructureError) {
    logger.error({ jobId: job?.id, err: err.message }, WORKER_LOGS.GENERIC_WORKER_FAILURE)
    return
  }

  const infraError = err as unknown as InfrastructureError

  logger.error(
    {
      jobId: job?.id,
      code: infraError.body.code,
      cause: infraError.cause,
    },
    `Falha de Infraestrutura: ${infraError.message}`,
  )
}

/**
 * Falha definitiva: reverte para PENDING para que o próximo ciclo da Outbox
 * re-despache. O limite MAX_DISPATCH_ATTEMPTS (processor) impede loop infinito.
 */
async function revertForRedispatch(
  context: { jobId: string | undefined; publicId: string | undefined },
  outboxRepository: IOutboxRepository,
): Promise<void> {
  const { jobId, publicId } = context

  if (!publicId) return

  const revertResult = await outboxRepository.updateStatus(publicId, IOutboxEventStatus.PENDING)

  if (isErr(revertResult)) {
    logger.warn({ jobId, publicId, error: revertResult.error }, WORKER_LOGS.OUTBOX_REVERT_AFTER_FINAL_FAILURE_ERROR)
    captureError(revertResult.error, { jobId, publicId })
    return
  }

  logger.warn({ jobId, publicId }, WORKER_LOGS.OUTBOX_REVERTED_AFTER_FINAL_FAILURE)
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
