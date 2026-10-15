# Architecture assessment + refactor plan: BullMQ-native jobs & Outbox scale-out

> **Status — revised 2026-10-15.** This document is the current architecture reference and execution plan for the
> `refactor/native-bullmq-functions` branch. It supersedes previous drafts and aligns directly with the
> source code as of commit `2f90160`.
>
> ### Summary of Subsystems & Refactor Scope
>
> | Component                                             | Status          | Action in this Refactor                                                                                                                                                                                                                   |
> | ----------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | **Part 3: Outbox Multi-pod CAS (`claim()`)**          | ✅ **RESOLVED** | **COMPLETED (Phase 1 & 3)**: Atomic `claim()` conditional update (`updateMany`) on `prisma-outbox-event-repository.ts` prevents duplicate attempts and race conditions. Multi-pod integration and scheduler idempotency verified. |
> | **Part 3.2: Worker Signal Trigger (Pub/Sub → Queue)** | ✅ **RESOLVED** | **COMPLETED (Phase 1 & 3)**: Replaced Redis Pub/Sub `OutboxSignal` with native BullMQ `outbox-dispatch` queue; events are handled by a single worker, queue on downtime, and integrate with BullMQ metrics. Point-to-point dispatch without fan-out verified across multiple worker pods. |
> | **Part 2A: Mail Queue Hardening & BullMQ Natives**    | ✅ **RESOLVED** | **COMPLETED (Phase 2 & 6)**: Adopted distributed BullMQ worker `limiter` (Gmail SMTP limits), right-sized `lockDuration`/`stalledInterval`, retained forensic jobs (`removeOnComplete/Fail`), added jitter and `UnrecoverableError` on permanent SMTP failures. Global rate limiting strictly honored across worker pods. |
> | **Failed Jobs DB Cleanup (BullMQ Job Scheduler)**    | ✅ **RESOLVED** | **COMPLETED (Phase 3)**: Added daily scheduled job (`05:00 AM`, 1-hour staggered after analytics retention) purging failed outbox records older than 7 days (`FAILED_DAYS: 7`) from PostgreSQL via `deleteFailedOlderThan`, matching BullMQ's 7-day forensic retention. |
> | **Part 2B: `FlowProducer` (Per-recipient jobs)**      | ⏸️ **DEFERRED** | **OUT OF SCOPE**: Gated to land alongside the future bulk/broadcast email roadmap (current events have at most 2 recipients and hand-rolled batch is protected by Redis idempotency).                                                     |
> | **Part 4: Church Routing Latency & Resilience**       | ✅ **RESOLVED** | **OUT OF SCOPE**: All 4 defects resolved in earlier commits (`cacheSuccessResults` removed, `LOCATION_IQ_ADDRESS` removed, `Deadline` threaded, routing uses `runGuardedAttempt` + cockatiel jitter). Kept synchronous.                   |
> | **Part 6: Multi-Pod Staging Smoke Test**              | ✅ **RESOLVED** | **COMPLETED (Phase 6)**: Staging environment verified with 2 worker pods (`fastify-worker-1`, `fastify-worker-2`). Verified point-to-point dispatch without fan-out, global SMTP limiter (2/s) shared via Redis, and metrics scraping on ports 9091 and 9092. |

---

## 1. Context & Architectural Decisions

The goal of this refactor is to modernize the background job processing infrastructure, prepare the system for multi-pod horizontal scaling, and eliminate failure modes in the mail and outbox subsystems.

Decisions confirmed for this refactor:

| Decision                       | Choice                                     | Rationale                                                                                                                                                              |
| ------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outbox concurrency control** | **`claim()` CAS via DB `updateMany`**      | Optimistic lock on `PENDING → SENDING` and `stuck SENDING → SENDING`. Ensures `attempts` increments exactly once across competing pods and sweeps.                     |
| **Worker event intake**        | **BullMQ `outbox-dispatch` queue**         | Replaces Redis Pub/Sub `OutboxSignal`. Eliminates pub/sub fan-out across multiple pods, prevents lost signals during worker downtime, and unifies queue monitoring.    |
| **BullMQ Worker `limiter`**    | **Adopt on Mail Worker**                   | Redis-backed distributed rate limit. Unlike Nodemailer's per-process pool limiter, BullMQ's limiter prevents exceeding upstream SMTP quotas when scaling horizontally. |
| **SMTP Provider Limits**       | **Standard Gmail SMTP settings in `.env`** | Default to conservative Gmail SMTP quotas (`MAIL_RATE_LIMIT_MAX: 2`, `MAIL_RATE_LIMIT_DURATION_MS: 1000`) with guidance for production relays.                         |
| **BullMQ native retries**      | **Retain + `UnrecoverableError` + Jitter** | Stop retrying fatal SMTP errors (5xx, unresolvable domains) via `UnrecoverableError`; add decorrelated jitter to backoff.                                              |
| **FlowProducer refactor**      | **Defer to bulk email roadmap**            | With ≤2 recipients per event today, a parent/child flow graph adds unnecessary operational complexity. Deferred until broadcast email arrives.                         |
| **Church routing calls**       | **Keep synchronous inside HTTP API**       | Keep out of the BullMQ refactor. Routing does not block the Node event loop, and all resilience issues were already solved.                                            |

---

## 2. Assessment of BullMQ Native Features: What Applies and What Doesn't

A critical review of BullMQ's native features against our architecture shows that only specific primitives provide value:

| Feature                                | Verdict                 | Analysis & Technical Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Worker `limiter`**                   | **ADOPT (Mail Worker)** | **High Value.** Nodemailer's `rateLimit` is process-local. Scaling from 1 pod to 3 pods triples the effective rate against the SMTP server. BullMQ's `limiter` coordinates atomically in Redis, maintaining an exact global ceiling across all pods.                                                                                                                                                                                                   |
| **Exponential Retry**                  | **ADOPT ENHANCEMENTS**  | **Already native** in BullMQ (`attempts: 3`, `backoff: exponential 10s`). Two key enhancements needed:<br>1. **Jitter**: Avoid synchronized thundering herds on recovery by introducing jitter via `settings.backoffStrategy`.<br>2. **Non-retryable errors**: Throwing BullMQ's native `UnrecoverableError` on permanent SMTP rejections (e.g., recipient mailbox not found, invalid address, 5xx non-transient) stops wasting retry attempts.        |
| **Native Job Timeout**                 | **DO NOT USE (N/A)**    | **Not a native BullMQ configuration property.** BullMQ v5 delegates timeouts to cooperative cancellation via `AbortSignal` in the processor (`job, token, signal`). SMTP network sockets are already bounded by Nodemailer's `connectionTimeout` (5s) and `socketTimeout` (10s). The real issue was oversized `lockDuration`/`stalledInterval` (300s), which will be right-sized.                                                                      |
| **Native Idempotency / Deduplication** | **PARTIALLY ADOPT**     | BullMQ's `jobId` and `deduplication` option (`{ id, ttl }`) only prevent adding duplicate jobs to the queue. They **cannot** prevent duplicate sends if a worker crashes mid-batch or a job re-runs after a stall. The application-level Redis `SET NX 'processing' → 'completed'` protocol must remain to protect SMTP delivery. However, fixing `removeOnComplete` retention restores the effectiveness of `jobId` deduplication at the queue level. |
| **`FlowProducer`**                     | **DEFER**               | Excellent for parent-child workflows (fan-out N sends, then execute a finalizer to delete the Outbox row). However, with only 1–2 recipients today, the hand-rolled batch is safe and reliable. Defer to the bulk email roadmap.                                                                                                                                                                                                                       |
| **`QueueEvents`**                      | **SKIP**                | Only needed for `job.waitUntilFinished()` or push-based monitoring. Prometheus metrics are polled on scrape via `getJobCounts()`, which is significantly cheaper than maintaining persistent Redis stream subscribers.                                                                                                                                                                                                                                 |

---

## 3. Worker Ingestion Architecture: Moving from Pub/Sub to BullMQ Queue

### 3.1 The Problem with Redis Pub/Sub (`OutboxSignal`)

Currently, when a domain event creates an Outbox row in PostgreSQL, the controller notifies the worker via `OutboxSignal.publishNewItem`:

```
API Pod ──(Redis PUBLISH)──► OutboxSignal Channel ──┬──► Worker Pod 1 (processSingleEvent)
                                                    └──► Worker Pod 2 (processSingleEvent) [FAN-OUT!]
```

This creates two critical defects:

1. **Pub/Sub Fan-Out on Multi-Pod Scaling**: Redis Pub/Sub delivers every message to **all** active subscribers. When scaling to $N$ worker pods, all $N$ pods simultaneously invoke `processSingleEvent` for the same event. Because `updateStatus(SENDING)` currently increments `attempts` unconditionally, a 5-pod cluster immediately exhausts the entire `MAX_DISPATCH_ATTEMPTS = 5` threshold on the very first dispatch attempt.
2. **Signal Loss on Downtime**: If the worker pod is restarting or temporarily disconnected, published messages are discarded by Redis. The outbox item remains unprocessed until the 5-minute fallback sweep runs.

### 3.2 The Solution: Dedicated `outbox-dispatch` Queue

Replace the Pub/Sub bus with a point-to-point BullMQ queue (`outbox-dispatch`):

```
API Pod ──(queue.add)──► BullMQ 'outbox-dispatch' Queue ──► Exactly ONE Worker Pod executes
```

**Benefits**:

- **Point-to-Point Delivery**: BullMQ's Redis Lua scripts ensure exactly one worker acquires and processes the dispatch job.
- **Durable Buffering**: If workers are restarting or scaling, jobs persist safely in Redis until workers come online.
- **Unified Observability**: Dispatch latency, queue depth, and retry attempts become visible in standard BullMQ Prometheus metrics (`bullmq_jobs{queue="outbox-dispatch"}`).
- **Cleaner Architecture**: Deletes `OutboxSignal`, eliminates two dedicated Redis client connections (`OutboxPublisher` and `OutboxSubscriber`), and drops custom payload serialization guards.

---

## 4. Detailed Specification: In-Scope Refactor Parts

### Part 3 — Outbox Multi-Pod CAS Correctness (`claim()`)

Even with point-to-point queues, a Compare-And-Set (CAS) guard at the database layer is mandatory because **the background sweeps (e.g. 5-minute sweep and stuck recovery) run concurrently with normal event dispatches**.

#### 4.1 Database Layer: `IOutboxRepository.claim()`

Add atomic `claim` semantics to `src/core/contracts/repository/outbox-repository.interface.ts`:

```ts
export interface OutboxClaimFilter {
  readonly publicId: string
  readonly fromStatus: IOutboxEventStatus
  readonly stuckBefore?: Date
}

// In IOutboxRepository:
claim(filter: OutboxClaimFilter): Promise<Result<boolean, AppError>>
```

In `PrismaOutboxRepository`:

```ts
async claim(filter: OutboxClaimFilter): Promise<Result<boolean, AppError>> {
  try {
    const where: Prisma.OutboxEventWhereInput = {
      publicId: filter.publicId,
      status: filter.fromStatus,
      ...(filter.stuckBefore ? { sendingAt: { lte: filter.stuckBefore } } : {}),
    }

    const result = await this.dbContext.client.outboxEvent.updateMany({
      where,
      data: {
        status: IOutboxEventStatus.SENDING,
        sendingAt: new Date(),
        attempts: { increment: 1 },
      },
    })

    return ok(result.count === 1)
  } catch (error) {
    return err(this.infraErrorMapper.mapToKnownError(error))
  }
}
```

#### 4.2 Outbox Processor Integration

In `src/lib/infra/jobs/outbox-processor.ts`:

- Replace unconditional `updateStatus(event.publicId, SENDING)` with `claim({ publicId: event.publicId, fromStatus: PENDING })`.
- If `claim` returns `ok(false)`, log and exit early: another worker or the sweep has already claimed the event.
- For `processStuckSendingEvents`, pass `fromStatus: SENDING` and `stuckBefore: thresholdDate`.

---

### Part 2A — Mail Queue Hardening & Sizing

#### 2A.1 Right-Sizing Lock and Stalled Windows (Defects 7 & 9)

In `src/messages/constants/workers/workers.ts`:

- **Lock Duration**: Reduce `LOCK_DURATION_MS` from `300_000` (5 minutes) to `60_000` (60 seconds). A single SMTP send takes $\le 10$ seconds; 60 seconds provides a $6\times$ buffer.
- **Stalled Interval**: Reduce `STALLED_INTERVAL_MS` from `300_000` to `30_000` (30 seconds).

**Corrected Analysis for `STUCK_SENDING_MS` (Defect 7)**:

- BullMQ automatically extends the lock while a job is running normally (`lockRenewTime = lockDuration / 2`).
- A job is only stalled if the process abruptly crashes without unlocking.
- With `lockDuration = 60s` and `stalledInterval = 30s`, a stalled job is picked up by BullMQ in under 90 seconds.
- Across 3 attempts with exponential backoff ($10\text{s} + 20\text{s} + 40\text{s}$), the absolute worst-case active life is $\approx 250$ seconds.
- Therefore, `STUCK_SENDING_MS = 900_000` (15 minutes) provides a healthy $\approx 3.6\times$ safety margin and will not prematurely reclaim running jobs.

#### 2A.2 Forensic Job Retention (Defects 6 & 8)

In `src/lib/queue/mail-queue.ts`:
Replace `removeOnComplete: true` and `removeOnFail: true` with bounded time/count retention:

```ts
defaultJobOptions: {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 10_000,
  },
  removeOnComplete: {
    age: 3600,       // Keep completed jobs for 1 hour for deduplication and telemetry
    count: 1000,     // Retain up to 1000 completed jobs
  },
  removeOnFail: {
    age: 604800,     // Keep failed jobs for 7 days (forensics / DLQ inspection)
    count: 2000,     // Retain up to 2000 failed jobs
  },
}
```

#### 2A.3 Distributed SMTP Rate Limiter (Gmail Standards)

Add worker-level rate limiting in `src/lib/workers/mail-worker.ts`:

```ts
const worker = new Worker<IOutboxDispatchData>(QUEUE.NAMES.MAIL, processor, {
  connection: workerConnection,
  concurrency: WORKER_CONSTANTS.MAIL.CONCURRENCY_LIMIT,
  lockDuration: WORKER_CONSTANTS.MAIL.LOCK_DURATION_MS,
  stalledInterval: WORKER_CONSTANTS.MAIL.STALLED_INTERVAL_MS,
  limiter: {
    max: env.MAIL_RATE_LIMIT_MAX,
    duration: env.MAIL_RATE_LIMIT_DURATION_MS,
  },
})
```

**Environment Variables for Gmail SMTP** in `src/env/index.ts` and `.env.example`:

```bash
# BullMQ Distributed Mail Worker Limiter
# Gmail standard limits: max ~100-500 emails/day, burst rate ~1-2 requests/sec.
MAIL_RATE_LIMIT_MAX=2
MAIL_RATE_LIMIT_DURATION_MS=1000
```

#### 2A.4 Fast Failure for Fatal Errors (`UnrecoverableError`)

In `mail-worker.ts`:
When `makeSendEmailUseCase().execute()` returns an error:

- Inspect SMTP response codes. Permanent rejections (e.g. RFC 550, 551, 553, 554, or invalid recipient addresses) must throw BullMQ's native `UnrecoverableError`.
- This immediately moves the job to the failed state without burning through useless exponential retries against an address that will never accept mail.

---

## 5. Status of Part 4: Church Routing Latency (Resolved)

All items from Part 4 of the original assessment have been **implemented and verified in the codebase**:

1. **CEP→coords success caching restored**: `cacheSuccessResults = false` was deleted, allowing immutable postal coordinates to be cached for 7 days in Redis.
2. **Nested timeout budgets implemented**: `Deadline` objects and `AbortSignal.any` are threaded from the outer orchestration use case down through the geocoding and address providers.
3. **Routing retry loop added**: `ResilientChurchRoutingProviderDecorator` executes via `runGuardedAttempt`, which uses cockatiel's retry policy with decorrelated jitter, bounded by the parent `Deadline`.
4. **Cleanup complete**: Unused `LOCATION_IQ_ADDRESS` configuration was removed and verified with Knip.
5. **Architectural boundary preserved**: Church routing remains a synchronous HTTP request and is **explicitly excluded** from background queue processing.

---

## 6. Execution Roadmap

```mermaid
flowchart TD
    subgraph Phase 1: Outbox Multi-pod CAS & Dispatch Queue (RESOLVED)
        P1A["1. Add claim() CAS to IOutboxRepository & Prisma"] --> P1B["2. Integrate claim() in OutboxProcessor"]
        P1B --> P1C["3. Replace OutboxSignal Pub/Sub with outbox-dispatch Queue"]
    end

    subgraph Phase 2: Mail Queue Hardening & Observability (RESOLVED)
        P2A["4. Right-size lockDuration and stalledInterval"] --> P2B["5. Configure forensic retention (removeOnComplete/Fail) & jitter"]
        P2B --> P2C["6. Add BullMQ distributed limiter with Gmail SMTP env defaults"]
        P2C --> P2D["7. Add UnrecoverableError mapping for permanent SMTP rejections"]
        P2D --> P2E["8. Observability: alerts.yml, metrics, and Grafana"]
    end

    subgraph Phase 3: Integration & Failed Jobs DB Cleanup (RESOLVED)
        P3A["9. Multi-pod Redis integration suite (5 maintenance schedulers)"] --> P3B["10. Failed jobs DB cleanup cron (05:00 AM daily, 7-day retention)"]
        P3B --> P3C["11. deleteFailedOlderThan on OutboxRepository & outbox-triage purge-failed"]
    end

    subgraph Phase 4: Dead-Letter Handling & Operational Triage (RESOLVED)
        P4A["12. findFailed() and retryFailed() on OutboxRepository"] --> P4B["13. outbox-triage service & npm run outbox:triage CLI"]
    end

    subgraph Phase 5: Bulk Email FlowProducer (SKIPPED)
        P5A["Deferred to Bulk Email Roadmap"]
    end

    subgraph Phase 6: Multi-Pod Staging Smoke Test (RESOLVED)
        P6A["14. Deploy 2+ worker pods in staging compose"] --> P6B["15. Verify point-to-point dispatch without fan-out"]
        P6B --> P6C["16. Verify global SMTP limiter (2/s) shared via Redis"]
        P6C --> P6D["17. Verify metrics scraping on ports 9091 (API) and 9092 (Workers)"]
    end

    Phase 1 --> Phase 2 --> Phase 3 --> Phase 4 --> Phase 6
```

### Verification Suite Plan & Results

1. **CAS Concurrency & State Machine (`in-memory-outbox-repository.spec.ts` & `outbox-processor.spec.ts`)**:
   - `claim()` conditional CAS update via DB `updateMany` guarantees atomic transition `PENDING → SENDING` and `stuck SENDING → SENDING`.
   - CAS contention returns `ok(false)` and prevents duplicate processing across competing pods.
2. **Dispatch Queue Tests (`outbox-dispatch-queue.spec.ts` & `outbox-dispatch-worker.spec.ts`)**:
   - Outbox dispatch jobs enqueued with `jobId = publicId` for automatic BullMQ deduplication.
   - Point-to-point worker consumption eliminates Redis Pub/Sub broadcast fan-out.
3. **Mail Worker Hardening Tests (`mail-worker.spec.ts` & `mail-worker-metrics.spec.ts`)**:
   - Unrecoverable RFC 5xx/`EENVELOPE` errors throw `UnrecoverableError`, increment `emails_permanent_rejections_total`, and abort retries immediately.
   - Transient SMTP errors (4xx / network) trigger exponential backoff with jitter.
   - BullMQ worker `limiter` enforces global rate limits (`MAIL_RATE_LIMIT_MAX: 2`, `MAIL_RATE_LIMIT_DURATION_MS: 1000`).
4. **Dead-Letter Handling & Triage (`outbox-triage.spec.ts`)**:
   - `findFailed`, `retryFailed`, and `purgeFailedOutboxEvents` allow operational inspection, re-dispatch, and cleanup of poison/failed events.
   - CLI script `scripts/outbox-triage.ts` exposed via `npm run outbox:triage` (`list`, `retry <id>`, `retry-all`, `purge-failed [days]`).
5. **Failed Jobs Database Cleanup (`outbox-maintenance.spec.ts` & `maintenance-scheduler.spec.ts`)**:
   - Automated daily BullMQ Job Scheduler at 05:00 AM (`CRON_SCHEDULES.DAILY_5AM`).
   - Purges terminal `FAILED` outbox events older than 7 days (`FAILED_DAYS: 7`), perfectly matching BullMQ's 7-day forensic retention window.
   - Preserves 1-hour staggered separation from outbox retention (03:00) and analytics retention (04:00).
6. **Multi-Pod Staging Smoke Test (`scripts/smoke-test-multi-pod.sh` & `.mjs`)**:
   - 2 worker pods (`fastify-worker-1` and `fastify-worker-2`) dynamically scaled via Docker Compose.
   - Enqueued 4 outbox events: all 4 claimed with `attempts === 1` and 0 duplicate attempts or fan-out across pods.
   - Redis-backed BullMQ mail-queue rate limiter active across all worker pods.
   - Scraped metrics from port 9091 (Fastify API, ~15 KB) and port 9092 (both Worker pods, ~14.4 KB and 322 lines).

