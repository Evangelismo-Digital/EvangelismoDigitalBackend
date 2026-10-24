/**
 * Integration — Job Schedulers do BullMQ contra um Redis real.
 *
 * Prova a afirmação central da migração do node-cron: N processos fazendo
 * upsert do MESMO id de agendador mantêm UM agendador e produzem UM job por
 * tique. Era isso que, com o cron dentro do processo, exigiria eleição de líder.
 *
 * Só Redis — sem Postgres, sem Prisma. Roda no CI pelo projeto
 * `integration-jobs`; localmente precisa do `docker-compose up` (Redis em
 * localhost:6379).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Queue, Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { QUEUE } from '@common/messages/constants/queue/queue'
import { CRON_SCHEDULES } from '@common/messages/constants/cron/cron'
import { startMaintenanceScheduler } from './maintenance-scheduler'
import type { IMaintenanceJobData } from '@infra/outbox/interfaces/maintenance-job-data.interface'

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const QUEUE_NAME = `${QUEUE.NAMES.MAINTENANCE}-itest`

function makeConnection() {
  return new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    family: 4,
  })
}

const connections: Redis[] = []
const queues: Queue<IMaintenanceJobData>[] = []
const workers: Worker<IMaintenanceJobData>[] = []

function makeQueue(): Queue<IMaintenanceJobData> {
  const connection = makeConnection()
  connections.push(connection)
  const queue = new Queue<IMaintenanceJobData>(QUEUE_NAME, { connection })
  queues.push(queue)
  return queue
}

/** Remove a fila inteira (jobs, agendadores e metadados) entre os testes. */
async function obliterate(queue: Queue<IMaintenanceJobData>) {
  for (const scheduler of await queue.getJobSchedulers()) {
    if (scheduler.key) await queue.removeJobScheduler(scheduler.key)
  }
  await queue.obliterate({ force: true })
}

beforeAll(async () => {
  const queue = makeQueue()
  await obliterate(queue)
})

afterEach(async () => {
  if (queues.length > 0) await obliterate(queues[0])
})

afterAll(async () => {
  await Promise.allSettled(workers.map((w) => w.close()))
  await Promise.allSettled(queues.map((q) => q.close()))
  await Promise.allSettled(connections.map((c) => c.quit()))
})

describe('Job Schedulers de manutenção contra Redis real', () => {
  it('registra os cinco agendadores no Redis com os padrões cron esperados', async () => {
    const queue = queues[0]

    await startMaintenanceScheduler(queue)

    const schedulers = await queue.getJobSchedulers()
    const byId = new Map(schedulers.map((s) => [s.key, s.pattern]))

    expect(schedulers).toHaveLength(5)
    expect(byId.get(QUEUE.SCHEDULER_IDS.FIVE_MIN_SWEEP)).toBe(CRON_SCHEDULES.EVERY_FIVE_MINUTES)
    expect(byId.get(QUEUE.SCHEDULER_IDS.MIDNIGHT_SCAN)).toBe(CRON_SCHEDULES.MIDNIGHT_DAILY)
    expect(byId.get(QUEUE.SCHEDULER_IDS.RETENTION_PURGE)).toBe(CRON_SCHEDULES.DAILY_3AM)
    expect(byId.get(QUEUE.SCHEDULER_IDS.ANALYTICS_RETENTION)).toBe(CRON_SCHEDULES.DAILY_4AM)
    expect(byId.get(QUEUE.SCHEDULER_IDS.FAILED_JOBS_CLEANUP)).toBe(CRON_SCHEDULES.DAILY_5AM)
  })

  /**
   * O teste que a fase 3 existe para passar: dois "pods" (duas conexões, duas
   * instâncias de Queue) fazem o upsert dos mesmos ids. Se o BullMQ duplicasse
   * por processo — que é o que o node-cron fazia — haveria dez agendadores.
   */
  it('dois pods fazendo upsert dos mesmos ids mantêm CINCO agendadores, não dez', async () => {
    const podA = queues[0]
    const podB = makeQueue()

    await startMaintenanceScheduler(podA)
    await startMaintenanceScheduler(podB)

    const schedulers = await podA.getJobSchedulers()

    expect(schedulers).toHaveLength(5)
    expect(await podA.getJobSchedulersCount()).toBe(5)
  })

  /**
   * A afirmação completa: um tique, UM job — mesmo com dois pods agendando.
   *
   * Usa um padrão de "todo segundo" num id próprio para não esperar cinco
   * minutos. O que se mede é quantos jobs o agendador produziu por tique, que é
   * a propriedade sob teste; o padrão em si é irrelevante para ela.
   */
  it('dois pods agendando o mesmo id produzem UM job por tique', async () => {
    const podA = queues[0]
    const podB = makeQueue()
    const schedulerId = 'maintenance:tick-test'
    const jobName = 'tick-test'

    const processed: string[] = []
    const connection = makeConnection()
    connections.push(connection)

    const worker = new Worker<IMaintenanceJobData>(
      QUEUE_NAME,
      async (job: Job<IMaintenanceJobData>) => {
        processed.push(job.id ?? 'sem-id')
      },
      { connection, concurrency: 1 },
    )
    workers.push(worker)
    await worker.waitUntilReady()

    await podA.upsertJobScheduler(schedulerId, { pattern: '* * * * * *' }, { name: jobName })
    await podB.upsertJobScheduler(schedulerId, { pattern: '* * * * * *' }, { name: jobName })

    // Três tiques de um segundo, com folga para o agendamento do BullMQ.
    await new Promise((resolve) => setTimeout(resolve, 3_500))
    await worker.close()

    // Um job por tique: com duplicação por pod, seriam ~2x os tiques.
    expect(processed.length).toBeGreaterThanOrEqual(2)
    expect(new Set(processed).size).toBe(processed.length)
    expect(processed.length).toBeLessThanOrEqual(4)

    await podA.removeJobScheduler(schedulerId)
  })

  it('reagendar é idempotente: o segundo upsert reescreve o agendador em vez de acumular', async () => {
    const queue = queues[0]

    await startMaintenanceScheduler(queue)
    await startMaintenanceScheduler(queue)
    await startMaintenanceScheduler(queue)

    expect(await queue.getJobSchedulersCount()).toBe(5)
  })

  /**
   * Contrapeso do teste de idempotência: os ids são a chave de deduplicação, e
   * ids DIFERENTES têm de produzir agendadores diferentes. Sem isto, uma
   * implementação que ignorasse o id e mantivesse sempre um único agendador
   * também passaria no teste acima.
   */
  it('ids distintos produzem agendadores distintos', async () => {
    const queue = queues[0]

    await queue.upsertJobScheduler('maintenance:alpha', { pattern: CRON_SCHEDULES.DAILY_3AM }, { name: 'alpha' })
    await queue.upsertJobScheduler('maintenance:beta', { pattern: CRON_SCHEDULES.DAILY_3AM }, { name: 'beta' })

    expect(await queue.getJobSchedulersCount()).toBe(2)
  })
})
