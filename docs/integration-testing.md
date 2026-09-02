# Integration test suite (opt-in)

A Layer-4 integration suite that runs the real infrastructure — **Docker Postgres
+ Docker Redis (incl. pub/sub and BullMQ)** — with only the outermost external
hops stubbed:

- **HTTP** to the geocoding/address APIs is stubbed at the `@lib/http/axios`
  `createHttpClient` boundary (no `nock`/`msw` dependency).
- **SMTP** is stubbed at the `NodemailerMailSender` boundary.

Everything between (resilient provider chains + decorators, the Redis
rate-limiter, `ResilientCache`, `DistributedLock`, `OutboxSignal` pub/sub, the
outbox processor, the BullMQ mail-job processor, the Fastify pipeline, Prisma
transactions) runs for real.

## Running it

```bash
docker compose up -d            # Postgres + Redis
npm run db:migrate:dev          # once, if the schema is stale
npm run test:integration:full   # vitest --project integration
```

It is **not** in the CI allowlist (`.github/workflows/ci.yml`) or
`scripts/ci-local.sh`, and `npm run test:unit` / `npm run verify` do not touch it.
Files are named `*.integration.spec.ts` and collected by the `integration` vitest
project (`vite.config.mts`), which uses the Docker prisma environment and runs
files **serially** (`fileParallelism: false`) because they share one Redis
keyspace and the Fastify singleton.

Each spec cleans up after itself (deletes the Postgres rows and Redis keys it
created); there is no per-test schema isolation, so keep new specs to
self-cleaning, prefix-scoped keys.

## Coverage map

| Spec | Exercises against real infra |
|---|---|
| `lib/infra/cache/resilient-cache.integration.spec.ts` | `getOrFetch` miss→fetch→envelope in Redis, hit served from Redis, in-flight dedup, negative caching of non-retryable errors, no-caching of `RETRYABLE`, circuit breaker at `maxPendingFetches`, `generateKey` stability |
| `lib/infra/distributed-lock/distributed-lock.integration.spec.ts` | `SET NX PX` acquire + TTL, contention → `null`, owner-only `renew`/`release` via the Lua guards, stale release does not delete a re-acquired lock, key independence |
| `lib/infra/rate-limiter/redis-rate-limiter.integration.spec.ts` | real `rate-limiter-flexible` token bucket: per-provider quota + refill after the window, bucket independence, fail-open when Redis is unreachable; plus the `@fastify/rate-limit` plugin returning 429 per-IP over a real Redis store |
| `lib/infra/events/outbox-signal.integration.spec.ts` | `publishNewItem` → subscriber receives `(publicId, event)` on the real channel, listener swap on re-subscribe (exactly-once), unrelated channels ignored, `publishNewItem` swallows a torn-down publisher |
| `lib/infra/jobs/outbox-processor.integration.spec.ts` | pending row → `SENDING` + `attempts++` + BullMQ `add` keyed by `publicId` (enqueue spied), lock contention skips the run, expired event deleted, poison event (`attempts >= MAX`) → `FAILED` |
| `lib/workers/mail-worker.integration.spec.ts` | full `createMailJobProcessor` lifecycle: send all → idempotency key `completed` + outbox row deleted, idempotent re-delivery re-deletes without re-sending, expiry gate deletes + skips SMTP, partial failure persists `pendingRecipients` for selective retry + frees the key + rethrows, `processing` key → `JobAlreadyProcessing` |
| `http/controllers/forms/forms.integration.spec.ts` | `POST /forms/submit-form`: 201 + form row + `PENDING` outbox event in one transaction (no `ipAddress` in the persisted payload), post-commit `OutboxSignal` publish, 409 on duplicate email, 400 on invalid bodies, **transaction rollback** leaves no orphan form row when the outbox insert fails |
| `providers/address-provider/resilient-address-provider.integration.spec.ts` | the address chain + resilient decorators + real Redis rate-limiter: fast path, advance past `RETRYABLE` (HTTP 429) with real backoff, all-404 → `InvalidCepError`, all-429 → last `RETRYABLE` error, a real rate-limit rejection short-circuits a downstream provider — the deterministic counterpart of `api-providers-fallback-strategy.e2e.spec.ts` |
