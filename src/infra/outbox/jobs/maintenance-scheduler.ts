import { Queue } from 'bullmq'
import { CRON_SCHEDULES } from '@common/messages/constants/cron/cron'
import { QUEUE } from '@common/messages/constants/queue/queue'
import { OUTBOX_LOGS } from '@common/messages/constants/logs/outbox'
import { logger } from '@infra/logger'
import { getMaintenanceQueue } from '@infra/outbox/queue/maintenance-queue'
import { IMaintenanceJobData } from '@infra/outbox/interfaces/maintenance-job-data.interface'

interface MaintenanceSchedule {
  schedulerId: string
  jobName: string
  pattern: string
}

/**
 * A tabela de agendamentos — a lista COMPLETA do que roda sozinho neste serviço.
 *
 * Os horários não mudaram na migração do node-cron: a retenção da outbox às
 * 03:00 e a de analytics às 04:00 continuam separadas por uma hora porque são
 * duas deleções em lote no mesmo banco, e sobrepô-las colocaria dois loops
 * longos disputando a mesma I/O na única janela em que podem ser lentas.
 *
 * Sem `tz` de propósito: o cron-parser do BullMQ, como o node-cron antes dele,
 * resolve o padrão no fuso local do processo. Informar um fuso aqui MOVERIA as
 * janelas em produção (o contêiner roda em UTC), que é exatamente o que esta
 * migração não pode fazer.
 */
const MAINTENANCE_SCHEDULES: readonly MaintenanceSchedule[] = [
  {
    schedulerId: QUEUE.SCHEDULER_IDS.FIVE_MIN_SWEEP,
    jobName: QUEUE.JOBS.FIVE_MIN_SWEEP,
    pattern: CRON_SCHEDULES.EVERY_FIVE_MINUTES,
  },
  {
    schedulerId: QUEUE.SCHEDULER_IDS.MIDNIGHT_SCAN,
    jobName: QUEUE.JOBS.MIDNIGHT_SCAN,
    pattern: CRON_SCHEDULES.MIDNIGHT_DAILY,
  },
  {
    schedulerId: QUEUE.SCHEDULER_IDS.RETENTION_PURGE,
    jobName: QUEUE.JOBS.RETENTION_PURGE,
    pattern: CRON_SCHEDULES.DAILY_3AM,
  },
  {
    schedulerId: QUEUE.SCHEDULER_IDS.ANALYTICS_RETENTION,
    jobName: QUEUE.JOBS.ANALYTICS_RETENTION,
    pattern: CRON_SCHEDULES.DAILY_4AM,
  },
  {
    schedulerId: QUEUE.SCHEDULER_IDS.FAILED_JOBS_CLEANUP,
    jobName: QUEUE.JOBS.FAILED_JOBS_CLEANUP,
    pattern: CRON_SCHEDULES.DAILY_5AM,
  },
]

/**
 * Registra os agendadores de manutenção no Redis.
 *
 * Substitui o `node-cron` e, com ele, a limitação de escala horizontal que o
 * worker documentava: o cron rodava DENTRO de cada processo, então N pods
 * executavam a mesma varredura N vezes e disputavam o DistributedLock. Um Job
 * Scheduler vive no Redis — todos os pods fazem upsert do MESMO id, o BullMQ
 * mantém um único agendador e emite UM job por tique, consumido por um único
 * worker pela semântica normal da fila. É idempotente por construção: chamar
 * esta função em todo boot de todo pod reescreve a mesma configuração.
 */
export async function startMaintenanceScheduler(
  queue: Queue<IMaintenanceJobData> = getMaintenanceQueue(),
): Promise<void> {
  for (const schedule of MAINTENANCE_SCHEDULES) {
    await queue.upsertJobScheduler(
      schedule.schedulerId,
      { pattern: schedule.pattern },
      { name: schedule.jobName, data: { schedulerId: schedule.schedulerId } },
    )
  }

  logger.info(OUTBOX_LOGS.SCHEDULER_CONFIGURED)
}
