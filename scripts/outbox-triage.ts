import { DatabaseContext } from '../src/lib/prisma/helpers/database-context'
import { PrismaOutboxRepository } from '../src/repositories/prisma/prisma-outbox-event-repository'
import { PrismaErrorMapper } from '../src/lib/prisma/utils/prisma-error-mapper'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '../src/repositories/prisma/errors/outbox-error-mapping'
import {
  listFailedOutboxEvents,
  retryFailedOutboxEvent,
  retryAllFailedOutboxEvents,
} from '../src/lib/infra/jobs/outbox-triage'
import { closeOutboxDispatchQueue } from '../src/lib/queue/outbox-dispatch-queue'
import { isErr } from '../src/core/shared/result'

async function main() {
  const action = process.argv[2] ?? 'list'
  const targetId = process.argv[3]

  const dbContext = new DatabaseContext()
  const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
  const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)
  const repository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)

  try {
    if (action === 'list') {
      const result = await listFailedOutboxEvents(repository, 50)
      if (isErr(result)) {
        console.error('Falha ao listar eventos FAILED:', result.error)
        process.exitCode = 1
        return
      }
      console.log(`Eventos FAILED encontrados (${result.value.length}):`)
      console.table(result.value)
    } else if (action === 'retry' && targetId) {
      const result = await retryFailedOutboxEvent(repository, targetId)
      if (isErr(result)) {
        console.error(`Falha ao re-tentar evento ${targetId}:`, result.error)
        process.exitCode = 1
        return
      }
      console.log(
        result.value
          ? `Evento ${targetId} resetado para PENDING e reenfileirado.`
          : `Evento ${targetId} não encontrado em status FAILED.`,
      )
    } else if (action === 'retry-all') {
      const result = await retryAllFailedOutboxEvents(repository, 50)
      if (isErr(result)) {
        console.error('Falha ao re-tentar eventos FAILED:', result.error)
        process.exitCode = 1
        return
      }
      console.log(`${result.value} eventos FAILED resetados para PENDING e reenfileirados.`)
    } else if (action === 'purge-failed') {
      const days = Number(targetId) || 7
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      const result = await repository.deleteFailedOlderThan(cutoff, 1000)
      if (isErr(result)) {
        console.error('Falha ao limpar eventos FAILED:', result.error)
        process.exitCode = 1
        return
      }
      console.log(`${result.value} eventos FAILED com mais de ${days} dias removidos da base.`)
    } else {
      console.log('Uso: npx tsx scripts/outbox-triage.ts [list | retry <publicId> | retry-all | purge-failed [days]]')
    }
  } finally {
    await closeOutboxDispatchQueue()
  }
}

void main()
