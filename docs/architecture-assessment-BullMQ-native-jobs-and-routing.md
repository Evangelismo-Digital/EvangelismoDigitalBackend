# Architecture assessment + refactor plan: BullMQ-native jobs & church-routing latency

## Context

The question that started this was whether to replace hand-rolled worker/rate-limit machinery with BullMQ
native features (`limiter`, `FlowProducer`, `QueueEvents`), and whether the church-routing external API
calls should be pushed into a worker so they "don't stall the main API".

After tracing both paths end to end, the answer splits cleanly:

- **Church routing does not stall the API** and does not belong in a queue. Awaiting HTTP does not block
  Node's event loop, and the fan-out that would justify a `FlowProducer` is already collapsed into a single
  batched Stadia matrix POST. Its real problems are a disabled cache, incoherent timeout budgets, and a
  missing retry — none of which a queue fixes.
- **The mail path is the one that genuinely wants BullMQ-native primitives.** Not because of today's volume
  (max 2 recipients per event) but because bulk/broadcast email is on the roadmap for the next few months,
  and the current design hand-rolls a fan-out/join that BullMQ's `FlowProducer` models natively.
- **Separately, the outbox has two real correctness bugs that only bite with more than one worker pod** —
  and scale-out is planned. These must land before the second pod does.

Decisions taken by the user during planning, recorded here so they aren't relitigated:

| Decision | Choice |
|---|---|
| Mail refactor depth | Full BullMQ-native (`FlowProducer`, per-recipient jobs, worker `limiter`) |
| Bulk email roadmap | Yes, likely within a few months — justifies the above |
| `cacheSuccessResults=false` on CEP→coords | Not deliberate; re-enable caching |
| Routing provider failure | **Keep failing hard.** No straight-line degradation, no second provider |
| Production topology | 1 API + 1 worker today, scale-out planned |
| `/churches/nearest` contract | Undecided — analysis below, recommendation is to keep it synchronous |

---

## Part 1 — Assessment

### 1.1 BullMQ native features: what actually applies

| Feature | Verdict | Reasoning |
|---|---|---|
| Worker `limiter` | **Adopt (mail)** | Real win for SMTP throughput control, and mandatory once bulk sending exists. Note: OSS BullMQ has no `limiter.groupKey` (BullMQ Pro only), so it is one rate per queue. |
| `FlowProducer` | **Adopt (mail only)** | Mail is a true fan-out/join: N sends, then one "delete the outbox row" step. That is exactly the parent/children model. Church routing is a *linear* 3-step chain — modelling it as a flow buys Redis round-trips and zero parallelism. |
| `QueueEvents` | **Skip** | Only needed for `job.waitUntilFinished()` (which we don't want) or as a metrics stream. Metrics already work via lazy `getJobCounts()` per Prometheus scrape, which is cheaper than a persistent stream consumer. |
| BullMQ limiter replacing `RedisRateLimiter` | **Do not** | Different scope. `RedisRateLimiter` is called *inline in the HTTP request* ([resilient-geocoding-provider.decorator.ts:45](src/providers/geo-provider/decorators/resilient-geocoding-provider.decorator.ts#L45)); a queue limiter cannot protect a synchronous path. It also isn't hand-rolled — it's `rate-limiter-flexible`'s `RateLimiterRedis` (atomic Lua, distributed-safe). Replacing it would lose per-provider granularity. |
| `QueueScheduler` | **N/A** | Removed in BullMQ v4+; delayed jobs are handled by the Worker itself. |

### 1.2 Should church routing move to a worker? (the trade-off analysis requested)

**The premise needs correcting first.** "Stalling the main API" implies event-loop blocking. Nothing in this
path is CPU-bound — it is `await`ed network I/O plus a small JSON parse. Node handles thousands of
concurrent awaited sockets fine. The real cost is different: **client-visible latency and availability are
welded to third-party uptime**, and during provider degradation a request occupies connection slots for up
to 15s.

Measured shape of the path ([find-nearest-churches-use-case.ts](src/use-cases/churches/find-nearest-churches-use-case.ts)):

| Scenario | Work |
|---|---|
| Cache hit | 1 Redis GET |
| Cold, happy path | **2** sequential external calls (AwesomeAPI `/cep`, 2s timeout → Stadia matrix, 3s timeout) + 1 PostGIS KNN |
| Cold, degraded | Up to ~19 sequential HTTP calls (3 address providers × 2 retries, then 3 geocoding strategies × 2 providers × 2 retries, then routing) |

Three options:

**(a) Keep synchronous — recommended.** The happy path is two external calls. Once L1 CEP caching is
restored (§3.1) the second-and-later request for any CEP skips the address/geocoding leg entirely, and a
repeat request for the same CEP is a single Redis GET. The cold-miss tail is a *budget* problem, not an
architecture problem.

**(b) Enqueue + `job.waitUntilFinished(queueEvents)`.** Strictly worse on every axis: same wall-clock plus
`queue.add` RTT, worker pickup latency, and QueueEvents notification; the API process *still* holds the HTTP
connection open, so it does not achieve the stated goal; and it adds a distributed failure mode (worker down
= request hangs to timeout). **Rejected.**

**(c) 202 Accepted + polling/SSE.** The only variant that genuinely decouples. Costs: frontend rewrite, two
round-trips minimum, and it penalises the *majority* case — a cache hit that would have returned in
single-digit milliseconds now takes at least two requests. Justified only if post-fix p99 cold latency is
still unacceptable.

**Recommendation: (a).** Re-measure p99 after Phase 3; revisit (c) only if it's still bad. Phase 3 is written
to be contract-neutral, so this decision does not block any work.

### 1.3 Real defects found

**Church routing**

1. **CEP→coords caching is switched off for successes.** [make-find-nearest-churches-use-case.ts:87](src/use-cases/factories/make-find-nearest-churches-use-case.ts#L87)
   passes `cacheSuccessResults = false`, and [cep-to-lat-lon-use-case.ts:54-56](src/use-cases/churches/cep-to-lat-lon-use-case.ts#L54-L56)
   then explicitly `DEL`s the key on every OK result. The L1 layer therefore retains only *negative* entries.
   Every miss on the outer key re-runs the full address + geocoding leg for data (CEP → lat/lon) that is
   effectively immutable. Confirmed unintentional.
2. **Nested timeout budgets don't nest.** Outer cache `fetchTimeoutMs` 15s, inner 10s
   ([cache.ts](src/messages/constants/cache/cache.ts)), and the outer `AbortSignal` is never threaded into the
   inner call ([find-nearest-churches-use-case.ts:44](src/use-cases/churches/find-nearest-churches-use-case.ts#L44)).
   They are independent budgets that stack rather than bound each other. 15s is also far past any sane client timeout.
3. **The routing decorator has no retry loop**, unlike its address and geo counterparts — a single transient
   blip fails the request.
4. Minor: `EnumProviderConfig.LOCATION_IQ_ADDRESS` (2 pts/s) is configured but referenced by no provider
   ([redis-rate-limiter.ts:97-100](src/lib/infra/rate-limiter/redis-rate-limiter.ts#L97-L100)); the
   `cachedUseCase` module singleton silently ignores its connection arguments after first call
   ([make-find-nearest-churches-use-case.ts:32-34](src/use-cases/factories/make-find-nearest-churches-use-case.ts#L32-L34)).

**Mail / outbox**

5. **`attempts` inflates once per pod on the pub/sub path.** `OutboxSignal` is Redis pub/sub, so a published
   signal fans out to *every* subscribed worker. Each calls `processSingleEvent` with **no lock**
   ([worker.ts:54-71](src/worker.ts#L54-L71) documents this), and each executes
   `updateStatus(publicId, SENDING)` — which increments `attempts`
   ([outbox-processor.ts:148](src/lib/infra/jobs/outbox-processor.ts#L148)). At 5 pods, one signal burns the
   entire `MAX_DISPATCH_ATTEMPTS = 5` budget and the event goes terminal `FAILED`. **This is the blocker for scale-out.**
6. **`jobId` dedup is not the safety net it's assumed to be.** It only holds while the job exists in Redis;
   with `removeOnComplete: true` and `removeOnFail: true` ([mail-queue.ts:25-26](src/lib/queue/mail-queue.ts#L25-L26))
   a completed job is gone, so re-adding the same `jobId` silently succeeds and re-sends.
7. **`STUCK_SENDING_MS` has zero safety margin.** 900s, versus a worst-case job lifetime of 3 attempts ×
   300s `lockDuration` = 900s ([workers.ts:3-5](src/messages/constants/workers/workers.ts#L3-L5)). The recovery
   sweep can reclaim a job that is still legitimately running — and per (6), dedup won't catch the duplicate.
8. **`removeOnFail: true` destroys all forensics.** No failed-job archive, no DLQ.
9. **`lockDuration`/`stalledInterval` of 300s are wildly oversized** for a job whose SMTP socket timeout is 10s.
10. Shutdown gaps: `closeAllRedisConnections()` is wired only into the API's `onClose`, never the worker;
    `cron.schedule` handles are never retained or `.stop()`ed, so a tick can fire mid-cleanup.

---

## Part 2 — Mail/outbox BullMQ-native refactor

Goal: replace the hand-rolled batch fan-out + selective-retry bookkeeping with a `FlowProducer` graph, and
adopt the worker `limiter` that bulk sending will require.

### 2.1 Flow topology

Replace the single `queue.add` in `dispatchToBullMQ`
([outbox-processor.ts:200-209](src/lib/infra/jobs/outbox-processor.ts#L200-L209)) with a `FlowProducer` tree:

```
parent  queue: 'mail-finalize'  name: 'outbox-finalize'
        data:  { publicId }
        opts:  { jobId: `finalize-${publicId}` }
  └── children (one per recipient), queue: 'mail-queue', name: 'send-email'
        data:  { publicId, email }
        opts:  { jobId: `${publicId}-${sha256(email.to).slice(0,16)}`,
                 attempts, backoff,            // from the strategy's jobOptions
                 ignoreDependencyOnFailure: true }
```

Notes that matter for implementation:

- **BullMQ custom job ids must not contain `:`** — hence the `-` separator and the hashed recipient. The id
  must be deterministic across re-dispatch so the idempotency check still dedups.
- `ignoreDependencyOnFailure: true` is essential: without it a child that exhausts its attempts leaves the
  parent stuck in `waiting-children` forever. With it, the parent runs once every child is either completed
  or failed.
- The parent needs its own queue and Worker (`mail-finalize`), since a parent must live in a queue that has a
  consumer. Child return values survive `removeOnComplete` — BullMQ persists them in the parent's
  `:processed` hash.

### 2.2 Child processor (`send-email`)

Rewrite [mail-worker.ts](src/lib/workers/mail-worker.ts) `createMailJobProcessor` to handle **one** email:

- Keep the expiration gate (lines 33-44) — still correct, but it no longer deletes the outbox row (that is
  now the parent's job); it just returns success.
- Idempotency key becomes per-recipient: `idempotency:email:${childJobId}`. Same `SET NX` / `'processing'` →
  `'completed'` protocol, same TTLs from `WORKER_CONSTANTS.IDEMPOTENCY_TTL`.
- Send one email via `makeSendEmailUseCase()`. No `Promise.allSettled`.
- **Delete outright**: the `updatePendingRecipients` + `job.updateData` selective-retry block (lines 105-131).
  Per-recipient jobs plus the 24h `'completed'` idempotency key make it redundant — a re-dispatch of an
  already-sent recipient short-circuits at the idempotency check.
- Keep per-recipient metrics (`collectMetricsEmailsSent`/`Failed`/`Skipped`); replace
  `collectMetricsEmailBatchDuration` with a per-send histogram.

### 2.3 Parent processor (`outbox-finalize`) — new file

New `src/lib/workers/mail-finalize-worker.ts`, following the shape of `startMailWorker`:

- Use `job.getFailedChildrenValues()` (or compare `getDependenciesCount()` against completed children) to
  determine outcome.
- All children succeeded → `outboxRepository.delete(publicId)`.
- Any child permanently failed → `outboxRepository.updateStatus(publicId, PENDING)` so the outbox re-dispatches;
  `MAX_DISPATCH_ATTEMPTS` remains the loop breaker.
- This subsumes `createJobFailureHandler`'s revert-to-PENDING responsibility (lines 210-223). Keep the handler
  for logging/Sentry on terminal failures, but it should no longer mutate outbox state.

### 2.4 Queue and worker configuration

In [mail-queue.ts](src/lib/queue/mail-queue.ts) and [workers.ts](src/messages/constants/workers/workers.ts):

- `removeOnComplete: { age: 3600, count: 1000 }` and `removeOnFail: { age: 604800, count: 1000 }` — replaces
  `true`/`true`, restoring forensics (defect 8) and making `jobId` dedup meaningful for a useful window (defect 6).
- `lockDuration: 60_000`, `stalledInterval: 30_000` — sized to a single SMTP send whose socket timeout is 10s
  (defect 9). This also retroactively fixes defect 7: worst-case job lifetime drops to roughly
  3 × 60s + backoff ≈ 210s, giving `STUCK_SENDING_MS = 900_000` a real 4× margin.
- Add worker `limiter: { max: env.MAIL_RATE_LIMIT_MAX, duration: env.MAIL_RATE_LIMIT_DURATION_MS }`, sized to
  the SMTP provider's published rate. New env vars in [`src/env/index.ts`](src/env/index.ts) and `.env.example`.
- Add a `FlowProducer` singleton alongside `getMailQueue()`, reusing `getRedisForQueue()`. It must be closed
  in the worker's `cleanup()`.

### 2.5 Schema follow-up

`pendingRecipients` becomes dead once §2.2 lands. Stop writing to it in this phase; drop the column and
`updatePendingRecipients` from `IOutboxRepository` in a separate migration once the new path has soaked.

---

## Part 3 — Outbox multi-pod correctness (must land before scale-out)

### 3.1 Compare-and-set on the PENDING → SENDING transition

The root fix for defect 5. In [prisma-outbox-event-repository.ts](src/repositories/prisma/prisma-outbox-event-repository.ts),
add a `claim(publicId)` method backed by a conditional update:

```ts
updateMany({
  where: { publicId, status: PENDING },
  data:  { status: SENDING, sendingAt: new Date(), attempts: { increment: 1 } },
})
```

Return whether `count === 1`. `OutboxProcessor.processSingleEvent` calls `claim` instead of
`updateStatus(SENDING)` ([outbox-processor.ts:148](src/lib/infra/jobs/outbox-processor.ts#L148)) and returns
early when the claim is lost. This is a DB-level optimistic lock: exactly one pod dispatches, `attempts`
increments exactly once, and it fixes the cron path and the pub/sub path with one change — no extra Redis
lock needed.

Note the recovery sweep re-claims `SENDING` rows, so `processStuckSendingEvents` needs a variant of the
predicate (`status: SENDING AND sendingAt <= threshold`) rather than `status: PENDING`.

### 3.2 Worker shutdown hygiene (defect 10)

In [worker.ts](src/worker.ts):

- Retain the handles returned by `cron.schedule` in `startOutboxCron`
  ([outbox-cron.ts](src/lib/infra/jobs/outbox-cron.ts)); return them and `.stop()` them first in `cleanup()`.
- Call `closeAllRedisConnections()` ([clients.ts:37](src/lib/redis/clients/clients.ts#L37)) in `cleanup()`,
  after the queue/worker closes and before `stopMetricsServer()` — preserving the documented
  "metrics server stops last" ordering.
- Close the new `FlowProducer` and the `mail-finalize` worker.
- Once §3.1 lands, the `@TODO: [ALERTA DE ESCALABILIDADE HORIZONTAL]` block at
  [worker.ts:54-71](src/worker.ts#L54-L71) can be rewritten: cron contention is already covered by
  `DistributedLock`, and the pub/sub race is now covered by the CAS. Leader election is no longer a prerequisite
  for scale-out.

---

## Part 4 — Church routing latency

Contract-neutral: none of this changes the response shape, so it is unaffected by the pending §1.2 decision.

### 4.1 Re-enable CEP→coords success caching (defect 1)

- Drop the `false` argument at [make-find-nearest-churches-use-case.ts:87](src/use-cases/factories/make-find-nearest-churches-use-case.ts#L87).
- Delete the `cacheSuccessResults` field, constructor parameter, and the `redis.del` block at
  [cep-to-lat-lon-use-case.ts:32,39,42,54-56](src/use-cases/churches/cep-to-lat-lon-use-case.ts#L54-L56) —
  the flag exists solely to support this behaviour. Check the `unit-churches` specs for call sites passing it.
- The existing 7-day TTL and 30-min negative TTL are appropriate for CEP→coordinate data.

### 4.2 Make the timeout budgets nest (defect 2)

- Thread the outer `AbortSignal` through: `cepToLatLonUseCase.execute({ cep }, signal)` at
  [find-nearest-churches-use-case.ts:44](src/use-cases/churches/find-nearest-churches-use-case.ts#L44), and
  accept it in `CepToLatLonUseCase.execute`.
- `ResilientCache.getOrFetch` ([resilient-cache.ts](src/lib/infra/cache/resilient-cache.ts)) takes an optional
  parent signal and combines it with its own via `AbortSignal.any([parent, AbortSignal.timeout(n)])` — Node 20
  supports `AbortSignal.any`. This preserves the existing per-layer timeout while making the outer budget a
  hard ceiling.
- Reduce budgets in [cache.ts](src/messages/constants/cache/cache.ts): `NEAREST_CHURCHES.FETCH_TIMEOUT_MS`
  15s → 8s, `CEP_COORDS.FETCH_TIMEOUT_MS` 10s → 5s. A client-facing GET should not hold a connection for 15s.

### 4.3 Add a retry loop to the routing decorator (defect 3)

Mirror the existing pattern in
[resilient-geocoding-provider.decorator.ts:52-80](src/providers/geo-provider/decorators/resilient-geocoding-provider.decorator.ts#L52-L80)
inside `resilient-church-routing-provider.decorator.ts`, with `MAX_RETRIES`/`BACKOFF_MS` added to
[stadia.ts](src/messages/constants/providers/stadia.ts). Rate limit is consumed once before the loop, matching
the other two decorators. This does not conflict with the "fail hard" decision — it only recovers transient blips.

Consider extracting the now thrice-duplicated retry+`sleep` body into a shared helper under
`src/providers/helpers/`, alongside the existing `precision-helper.ts`.

### 4.4 Cleanup (defect 4)

Remove the unused `EnumProviderConfig.LOCATION_IQ_ADDRESS` entry and its config block. Verify with
`npm run knip`.

---

## Explicitly out of scope (accepted risks)

- **No routing fallback and no second routing provider.** Per the user's decision, a Stadia failure — including
  a local `ServiceBusyError` from our own 50 req/s limiter — remains a hard error for `/churches/nearest`,
  even though valid coordinates and 5 ranked churches are already in hand at that point. Documented as an
  accepted single point of failure.
- **No `QueueEvents`** (§1.1).
- **`/churches/nearest` stays a synchronous GET** unless §1.2 is revisited after re-measuring.

---

## Verification

**Static / existing suites**

```bash
npm run typecheck && npm run lint && npm run knip
npm run test:unit:all
npm run test:unit:resilient-cache      # §4.2 changes ResilientCache's signature
npm run test:unit:churches             # §4.1, §4.3
npm run test:e2e                       # needs docker-compose up
```

**New tests required**

- `outbox-processor.spec.ts` — concurrent `processSingleEvent` for the same event increments `attempts`
  exactly once (§3.1). Use the in-memory outbox repository under
  [src/repositories/in-memory/](src/repositories/in-memory/), extended with CAS semantics.
- Child processor — per-recipient idempotency: a second job with the same deterministic `jobId` after a
  `'completed'` key exists must skip, not re-send.
- Parent processor — all-children-succeeded deletes the outbox row; any-child-failed reverts it to `PENDING`.
- `cep-to-lat-lon-use-case.spec.ts` — a second `execute` for the same CEP hits the cache and makes zero
  provider calls (the regression that defect 1 would reintroduce).
- Timeout nesting — aborting the outer signal aborts the in-flight inner provider call.

**Manual / integration**

1. `docker-compose up`, then `npm run dev` and `npm run start:worker`.
2. `POST /forms` with a decision-for-Christ payload → confirm in Redis that a flow parent plus **two** child
   jobs are created, that both emails arrive, and that the `outbox_events` row is deleted by the parent.
3. Force a child failure (point `SMTP_HOST` at a black hole) → confirm the child exhausts its attempts, the
   parent still runs, the outbox row returns to `PENDING`, and the failed job is still inspectable in Redis
   (the `removeOnFail` change).
4. `GET /churches/nearest?cep=01001000` twice → second call should be a single Redis GET. Then flush only
   `cache:nearest-churches:*` and repeat: the third call must **not** hit AwesomeAPI, proving §4.1.
5. Scrape `:9092/metrics` and confirm the new per-send histogram and unchanged outbox counters.
6. `npm run ci:local` before pushing.
