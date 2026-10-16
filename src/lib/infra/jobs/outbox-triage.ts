import { IOutboxRepository, IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors'
import { enqueueOutboxDispatch } from '@lib/queue/outbox-dispatch-queue'

export interface FailedEventSummary {
  id: number
  publicId: string
  type: string
  status: string
  attempts: number
  occurredAt: Date
  pendingRecipients: string[]
}

function toSummary(event: IOutboxEvent): FailedEventSummary {
  return {
    id: event.id,
    publicId: event.publicId,
    type: event.type,
    status: event.status,
    attempts: event.attempts,
    occurredAt: event.occurredAt,
    pendingRecipients: event.pendingRecipients,
  }
}

export async function listFailedOutboxEvents(
  outboxRepository: IOutboxRepository,
  limit = 50,
): Promise<Result<FailedEventSummary[], AppError>> {
  const result = await outboxRepository.findFailed(limit)
  if (isErr(result)) {
    return result
  }

  return ok(result.value.map(toSummary))
}

export async function retryFailedOutboxEvent(
  outboxRepository: IOutboxRepository,
  publicId: string,
): Promise<Result<boolean, AppError>> {
  const retryResult = await outboxRepository.retryFailed(publicId)
  if (isErr(retryResult) || !retryResult.value) {
    return retryResult
  }

  const eventResult = await outboxRepository.findByPublicId(publicId)
  if (isErr(eventResult)) {
    return eventResult
  }

  if (eventResult.value) {
    void enqueueOutboxDispatch(eventResult.value)
  }

  return ok(true)
}

export async function retryAllFailedOutboxEvents(
  outboxRepository: IOutboxRepository,
  limit = 50,
): Promise<Result<number, AppError>> {
  const failedResult = await outboxRepository.findFailed(limit)
  if (isErr(failedResult)) {
    return failedResult
  }

  let retriedCount = 0
  for (const event of failedResult.value) {
    const retried = await retryFailedOutboxEvent(outboxRepository, event.publicId)
    if (isErr(retried)) {
      return retried
    }
    if (retried.value) {
      retriedCount += 1
    }
  }

  return ok(retriedCount)
}

export async function purgeFailedOutboxEvents(
  outboxRepository: IOutboxRepository,
  cutoff: Date,
  batchSize = 1000,
): Promise<Result<number, AppError>> {
  return outboxRepository.deleteFailedOlderThan(cutoff, batchSize)
}
