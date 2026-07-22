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
      help: 'Pub/Sub wakeup signals published after an outbox write',
      registers: [registry],
    })
  : null

export const collectMetricsOutboxSignalPublishFailed = registry
  ? new Counter({
      name: 'outbox_signal_publish_failed_total',
      help: 'Pub/Sub signal publish failures (Redis unavailable)',
      registers: [registry],
    })
  : null
