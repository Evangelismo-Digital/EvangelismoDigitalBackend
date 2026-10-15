import { Job, Worker } from 'bullmq'
import { OutboxProcessor } from './outbox-processor'
import { OutboxMaintenance } from './outbox-maintenance'
import { AnalyticsRetention } from './analytics-retention'
import { logger } from '@lib/logger'
import { captureError } from '@lib/sentry/capture'
import { collectMetricsOutboxCronRuns, collectMetricsOutboxCronFailures } from '@lib/metrics/outbox-metrics'
import { QUEUE } from 'messages/constants/queue/queue'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'
import { ANALYTICS_LOGS } from 'messages/constants/analytics/analytics'
import { WORKER_CONSTANTS } from 'messages/constants/workers/workers'
import { createWorkerConnection } from '@lib/redis/clients/clients'
import { attachRedisLogger } from '@lib/redis/connections/redis-bullMQ-connection'
import { IMaintenanceJobData } from 'core/contracts/lib/infra/maintenance-job-data.interface'

export interface MaintenanceDeps {
  processor: OutboxProcessor
  maintenance: OutboxMaintenance
  analyticsRetention: AnalyticsRetention
}

/** Uma fase do job: o rótulo da métrica, o trabalho e como relatar a falha. */
interface Phase {
  name: string
  run: () => Promise<void>
  errorMessage: string
  onSuccess?: string
  sentryContext?: Record<string, unknown>
}

type MaintenanceJob = Job<IMaintenanceJobData>

/**
 * Varredura de 5 min: expira ANTES de processar pendentes, para que um PENDING
 * recém-expirado seja deletado e não despachado (link morto nunca é enviado).
 */
function fiveMinSweepPhases({ processor, maintenance }: MaintenanceDeps): Phase[] {
  return [
    {
      name: 'five_min_sweep',
      run: () => maintenance.sweepExpiredEvents(),
      errorMessage: OUTBOX_LOGS.FIVE_MIN_SWEEP_EXPIRY_ERROR,
    },
    {
      name: 'five_min_pending',
      run: () => processor.processPendingEvents(),
      errorMessage: OUTBOX_LOGS.FIVE_MIN_SWEEP_PENDING_ERROR,
    },
  ]
}

/**
 * Meia-noite: recupera SENDING travado antes dos pendentes, para limpar o
 * estado inconsistente antes de processar evento novo.
 */
function midnightScanPhases({ processor }: MaintenanceDeps): Phase[] {
  return [
    {
      name: 'midnight_recovery',
      run: () => processor.processStuckSendingEvents(),
      errorMessage: OUTBOX_LOGS.PHASE1_ERROR,
      onSuccess: OUTBOX_LOGS.PHASE1_DONE,
      sentryContext: { phase: 1 },
    },
    {
      name: 'midnight_pending',
      run: () => processor.processPendingEvents(),
      errorMessage: OUTBOX_LOGS.PHASE2_ERROR,
      onSuccess: OUTBOX_LOGS.PHASE2_DONE,
      sentryContext: { phase: 2 },
    },
  ]
}

function retentionPurgePhases({ maintenance }: MaintenanceDeps): Phase[] {
  return [
    {
      name: 'retention_purge',
      run: () => maintenance.purgeOldEvents(),
      errorMessage: OUTBOX_LOGS.RETENTION_CRON_ERROR,
    },
  ]
}

function analyticsRetentionPhases({ analyticsRetention }: MaintenanceDeps): Phase[] {
  return [
    {
      name: 'analytics_retention',
      run: () => analyticsRetention.purgeExpiredData(),
      errorMessage: ANALYTICS_LOGS.RETENTION_ERROR,
    },
  ]
}

function failedJobsCleanupPhases({ maintenance }: MaintenanceDeps): Phase[] {
  return [
    {
      name: 'failed_jobs_cleanup',
      run: () => maintenance.purgeFailedEvents(),
      errorMessage: OUTBOX_LOGS.FAILED_PURGE_ERROR,
    },
  ]
}

/**
 * Map, e não objeto indexado: o nome do job vem de fora (do Redis), e indexar
 * um objeto com string externa é exatamente o padrão que o
 * `security/detect-object-injection` existe para pegar.
 *
 * Cada agendamento é UM job com as fases dentro, nunca um job por fase: a ordem
 * entre elas é a garantia que se perderia ao fatiar.
 */
const PHASE_BUILDERS = new Map<string, (deps: MaintenanceDeps) => Phase[]>([
  [QUEUE.JOBS.FIVE_MIN_SWEEP, fiveMinSweepPhases],
  [QUEUE.JOBS.MIDNIGHT_SCAN, midnightScanPhases],
  [QUEUE.JOBS.RETENTION_PURGE, retentionPurgePhases],
  [QUEUE.JOBS.ANALYTICS_RETENTION, analyticsRetentionPhases],
  [QUEUE.JOBS.FAILED_JOBS_CLEANUP, failedJobsCleanupPhases],
])

function phasesFor(jobName: string, deps: MaintenanceDeps): Phase[] {
  return PHASE_BUILDERS.get(jobName)?.(deps) ?? []
}

/**
 * Esta é a última tentativa do BullMQ?
 *
 * Dentro do processador, `attemptsMade` conta as tentativas ANTERIORES (0 na
 * primeira execução), por isso o `+ 1`.
 */
function isFinalAttempt(job: MaintenanceJob): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
}

/**
 * Executa uma fase e DEVOLVE o erro em vez de lançá-lo — é isso que preserva a
 * regra antiga do cron: uma fase que falha não impede a próxima de rodar. Quem
 * decide lançar é o chamador, depois que todas tiveram sua chance.
 */
async function runPhase(phase: Phase, job: MaintenanceJob): Promise<{ error: unknown } | null> {
  collectMetricsOutboxCronRuns?.inc({ phase: phase.name })

  try {
    await phase.run()

    if (phase.onSuccess) {
      logger.info(phase.onSuccess)
    }

    return null
  } catch (error) {
    reportPhaseFailure(phase, job, error)
    return { error }
  }
}

/**
 * Sentry só recebe falha terminal, seguindo a política do mail-worker: uma
 * tentativa que ainda será repetida é ruído, não incidente. Só o caminho
 * terminal mantém a forma exata da chamada antiga ao `captureError`, inclusive
 * a aridade (com e sem contexto).
 */
function reportPhaseFailure(phase: Phase, job: MaintenanceJob, error: unknown): void {
  if (!isFinalAttempt(job)) {
    collectMetricsOutboxCronFailures?.inc({ phase: phase.name, outcome: 'retrying' })
    logger.warn({ error, phase: phase.name, attempt: job.attemptsMade + 1 }, OUTBOX_LOGS.MAINTENANCE_PHASE_RETRYING)
    return
  }

  collectMetricsOutboxCronFailures?.inc({ phase: phase.name, outcome: 'exhausted' })
  logger.error({ error }, phase.errorMessage)

  if (phase.sentryContext) {
    captureError(error, phase.sentryContext)
  } else {
    captureError(error)
  }
}

/** Roda todas as fases em ordem e devolve as falhas, sem interromper na primeira. */
async function runAllPhases(phases: Phase[], job: MaintenanceJob): Promise<unknown[]> {
  const isMidnightScan = job.name === QUEUE.JOBS.MIDNIGHT_SCAN

  if (isMidnightScan) {
    logger.info(OUTBOX_LOGS.CRON_START)
  }

  const failures: unknown[] = []

  for (const phase of phases) {
    const outcome = await runPhase(phase, job)

    if (outcome) {
      failures.push(outcome.error)
    }
  }

  if (isMidnightScan) {
    logger.info(OUTBOX_LOGS.SCAN_DONE)
  }

  return failures
}

/**
 * `only-throw-error` exige um Error. Uma falha isolada sobe como ela mesma
 * (preserva a identidade do erro no log do BullMQ); várias viram um
 * AggregateError para que nenhuma seja perdida no caminho.
 */
function asThrowable(failures: unknown[]): Error {
  if (failures.length === 1 && failures[0] instanceof Error) {
    return failures[0]
  }

  return new AggregateError(failures, OUTBOX_LOGS.MAINTENANCE_PHASE_RETRYING)
}

/**
 * Handler dos jobs de manutenção.
 *
 * Política de falha: roda todas as fases e só então decide. Se alguma falhou e
 * ainda há tentativa, lança para o BullMQ repetir com backoff; na última,
 * engole depois de logar e reportar ao Sentry — o próximo tique do agendador
 * continua sendo a rede de segurança final. Reexecutar é seguro: todas as
 * varreduras são idempotentes e protegidas por DistributedLock.
 *
 * Consequência deliberada de engolir na última tentativa: o job termina como
 * `completed`, então `bullmq_jobs{state="failed"}` não enxerga manutenção —
 * quem enxerga é `outbox_cron_failures_total{phase,outcome="exhausted"}`, e é
 * sobre ela que o alerta MaintenancePhaseExhausted dispara.
 */
export function createMaintenanceJobProcessor(deps: MaintenanceDeps) {
  return async (job: MaintenanceJob): Promise<void> => {
    const phases = phasesFor(job.name, deps)

    if (phases.length === 0) {
      logger.warn({ jobName: job.name, jobId: job.id }, OUTBOX_LOGS.MAINTENANCE_JOB_UNKNOWN)
      return
    }

    const failures = await runAllPhases(phases, job)

    if (failures.length > 0 && !isFinalAttempt(job)) {
      throw asThrowable(failures)
    }
  }
}

export function startMaintenanceWorker(deps: MaintenanceDeps): Worker<IMaintenanceJobData> {
  const workerConnection = createWorkerConnection()
  attachRedisLogger(workerConnection, 'MaintenanceWorker')

  const worker = new Worker<IMaintenanceJobData>(QUEUE.NAMES.MAINTENANCE, createMaintenanceJobProcessor(deps), {
    connection: workerConnection,
    concurrency: WORKER_CONSTANTS.MAINTENANCE.CONCURRENCY_LIMIT,
  })

  logger.info(OUTBOX_LOGS.MAINTENANCE_WORKER_STARTED)

  return worker
}
