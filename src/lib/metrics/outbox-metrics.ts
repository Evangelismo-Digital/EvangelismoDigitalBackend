import { Counter } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const collectMetricsOutboxEventsDispatched = registry
  ? new Counter({
      name: 'outbox_events_dispatched_total',
      help: 'Events successfully enqueued to BullMQ',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxEventsClaimed = registry
  ? new Counter({
      name: 'outbox_events_claimed_total',
      help: 'Outbox CAS claim attempts by outcome (claimed | contention)',
      labelNames: ['outcome'],
      registers: [registry],
    })
  : null

export const collectMetricsOutboxEventsReverted = registry
  ? new Counter({
      name: 'outbox_events_reverted_total',
      help: 'Dispatch failed and the event was successfully reverted to PENDING',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxEventsRevertFailed = registry
  ? new Counter({
      name: 'outbox_events_revert_failed_total',
      help: 'Dispatch failed and the revert-to-PENDING write also failed (stranded in SENDING)',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxEventsMarkedAsTerminalFail = registry
  ? new Counter({
      name: 'outbox_events_marked_as_terminal_fail_total',
      help: 'Events marked terminal FAILED after exceeding the dispatch attempts cap (poison message)',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxEventsExpired = registry
  ? new Counter({
      name: 'outbox_events_expired_total',
      help: 'Events deleted at the expiration gate before dispatch',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxEventsStuckSendingEventsRecovered = registry
  ? new Counter({
      name: 'outbox_events_stuck_sending_events_recovered_total',
      help: 'Stuck SENDING events reprocessed by the recovery loop',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxCronRuns = registry
  ? new Counter({
      name: 'outbox_cron_runs_total',
      help: 'Outbox cron executions by phase',
      labelNames: ['phase'],
      registers: [registry],
    })
  : null

/**
 * Falhas por fase, separadas por desfecho: `retrying` é uma tentativa que o
 * BullMQ ainda vai repetir, `exhausted` é a desistência. Sem isto, uma fase que
 * falha e se recupera na segunda tentativa fica idêntica a uma saudável no
 * painel — `outbox_cron_runs_total` só conta execuções.
 */
export const collectMetricsOutboxCronFailures = registry
  ? new Counter({
      name: 'outbox_cron_failures_total',
      help: 'Maintenance phase failures by phase and outcome (retrying | exhausted)',
      labelNames: ['phase', 'outcome'],
      registers: [registry],
    })
  : null

export const collectMetricsOutboxMaintenanceDeleted = registry
  ? new Counter({
      name: 'outbox_maintenance_deleted_total',
      help: 'Events deleted by maintenance sweeps, by operation',
      labelNames: ['operation'],
      registers: [registry],
    })
  : null

export const collectMetricsOutboxSignalPublished = registry
  ? new Counter({
      name: 'outbox_signal_published_total',
      help: 'Pub/Sub wakeup signals published after an outbox write (deprecated in favor of outbox_dispatch_enqueued_total)',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxSignalPublishFailed = registry
  ? new Counter({
      name: 'outbox_signal_publish_failed_total',
      help: 'Pub/Sub signal publish failures (deprecated in favor of outbox_dispatch_enqueue_failed_total)',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxDispatchEnqueued = registry
  ? new Counter({
      name: 'outbox_dispatch_enqueued_total',
      help: 'Events successfully enqueued to outbox-dispatch queue',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxDispatchEnqueueFailed = registry
  ? new Counter({
      name: 'outbox_dispatch_enqueue_failed_total',
      help: 'Failures enqueuing event to outbox-dispatch queue (Redis down)',
      registers: [registry],
    })
  : null
