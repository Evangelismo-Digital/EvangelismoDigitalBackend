## Plan: Production Hardening Review

Short version: the backend already has several good resilience primitives, but it is not yet tuned for a production launch targeting ~10k concurrent users. The main work is not feature delivery; it is closing operational risks: safer error exposure, observability, queue durability, auth abuse control, data access scalability, and high-availability assumptions around Redis and background processing.

## Executive Summary

The codebase has a strong base: global rate limiting, Redis outage throttling, request context propagation, structured logging, a resilient cache layer, and an outbox pattern for async delivery. Those are the right building blocks. The remaining work is to make those building blocks production-operable at scale and to remove the places where internal implementation details can leak to clients or become bottlenecks under load.

The biggest readiness gaps are:
- Generic technical error responses still need to be enforced everywhere.
- Sentry exists, but tracing and profiling are configured too aggressively for a high-traffic launch.
- There is no Prometheus/Grafana metrics pipeline yet.
- Redis is still a critical single-host dependency for cache, rate limiting, queueing, and outbox signaling.
- Password-reset email still blocks the request path.
- Login abuse controls are incomplete despite the schema already containing lockout-oriented fields.
- Admin user listing/search does not yet have a clear scale strategy.
- Audit/outbox data retention is not defined.
- Core contracts still leak Prisma types into the application boundary.

## Proposed Solution

### 1. Harden public error handling

Goal: ensure users never receive raw technical messages from infrastructure, provider, or internal failures.

Recommended changes:
- Make the Fastify error handler return generic messages for unexpected or infrastructure-related failures.
- Keep specific validation messages only for input validation problems.
- Never send upstream provider messages, stack-derived text, or raw `error.message` to clients in production.
- Route all unhandled failures through Sentry and structured logs, but keep the client response generic.

Why this matters:
- External API errors, SMTP failures, DB issues, and Redis outages should not expose implementation details or internal topology.
- Generic responses reduce information leakage and simplify support handling.

Relevant code areas:
- `/home/amaro/EvangelismoDigitalBackend/src/http/plugins/error-handler.plugin.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/errors/http-errors/http-error-mapper.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/errors/http-errors/http-error-status.mapper.ts`

Acceptance criteria:
- Production responses for technical failures use a standard message.
- Validation errors still return field-level detail.
- Logs retain enough context for diagnosis without exposing secrets.

### 2. Tune observability for production scale

Goal: get actionable telemetry without turning observability into its own performance problem.

Recommended changes:
- Reduce Sentry tracing and profiling from full capture to sampled capture.
- Decide explicit sampling rates by environment.
- Add Prometheus metrics for HTTP latency, status codes, request volume, Redis availability, queue depth, worker job outcomes, and outbox lag.
- Build Grafana dashboards from those metrics.
- Define alert thresholds for error spikes, slow requests, queue buildup, and Redis degradation.

Why this matters:
- At 10k concurrent users, logs alone are not enough.
- Full profiling/tracing on every request is too expensive and noisy.
- Metrics are the fastest way to know whether the system is healthy before users report it.

Relevant code areas:
- `/home/amaro/EvangelismoDigitalBackend/src/app.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/server.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/worker.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/lib/logger/index.ts`

Acceptance criteria:
- Sentry is active in production with reasonable sampling.
- Prometheus can scrape a stable metrics endpoint.
- Grafana dashboards show traffic, latency, errors, and queue health.
- Alerts exist for degraded dependencies.

### 3. Strengthen authentication and abuse controls

Goal: reduce credential-stuffing and brute-force risk while preserving usability.

Recommended changes:
- Enforce login attempt tracking and account blocking using the existing `loginAttempts` and `BLOCKED` schema concepts.
- Keep the current IP-based global limiter, but add identity-aware throttling for auth routes.
- Consider separate rate limits for login, forgot-password, and reset-password flows.
- Make the lockout policy explicit and testable.

Why this matters:
- IP-only throttling is not enough when attackers rotate addresses or attack a single account from distributed sources.
- The schema already hints at the intended security model; it should be operationalized.

Relevant code areas:
- `/home/amaro/EvangelismoDigitalBackend/src/use-cases/users/authenticate-user.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/http/policies/rate-limit.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/http/plugins/rate-limit.plugin.ts`
- `/home/amaro/EvangelismoDigitalBackend/prisma/schema.prisma`

Acceptance criteria:
- Failed logins increment attempts.
- Blocked accounts cannot continue to authenticate until policy allows it.
- Auth endpoints have tighter rate limits than generic routes.

### 4. Move mail delivery off the request path

Goal: prevent external mail latency from slowing down user-facing requests.

Recommended changes:
- Move password-reset email to an async flow using the existing outbox/queue architecture.
- Keep transactional email semantics: commit business state first, then dispatch messages asynchronously.
- Add retry/backoff and job-retention policy for failed dispatches.
- Preserve idempotency so duplicate jobs do not send duplicate emails.

Why this matters:
- SMTP is an external dependency and can be slow or unstable.
- Users should receive a fast response even if mail delivery is delayed.

Relevant code areas:
- `/home/amaro/EvangelismoDigitalBackend/src/use-cases/users/forgot-password.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/use-cases/email/send-email.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/lib/workers/mail-worker.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/lib/infra/jobs/outbox-processor.ts`

Acceptance criteria:
- Password-reset requests no longer wait on SMTP round trips.
- Failed email jobs are retained long enough to inspect or replay.
- Duplicate processing does not create duplicate sends.

### 5. Make Redis and background processing production-safe

Goal: remove single-node fragility from shared infra components.

Recommended changes:
- Decide a real Redis HA strategy: Sentinel, cluster, or managed Redis with failover.
- Validate reconnect, failover, and timeout behavior for cache, queue, and rate limit clients.
- Add leader election for the outbox cron so only one instance performs the sweep at a time.
- Keep the current distributed lock semantics, but reduce unnecessary multi-pod contention.

Why this matters:
- Redis is already central to multiple critical paths.
- A Redis outage should degrade gracefully where possible, but the platform should not depend on a single instance for sustained availability.

Relevant code areas:
- `/home/amaro/EvangelismoDigitalBackend/src/worker.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/lib/infra/jobs/outbox-processor.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/lib/infra/distributed-lock/distributed-lock.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/lib/redis/clients/clients.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/lib/redis/connections/redis-rate-limiter-connection.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/lib/redis/connections/redis-cache-connection.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/lib/redis/connections/redis-bullMQ-connection.ts`

Acceptance criteria:
- Redis failure behavior is defined per subsystem.
- Outbox processing does not thrash across multiple pods.
- Queue and cache clients reconnect predictably.

### 6. Improve read scalability for user/admin endpoints

Goal: keep administrative reads fast and predictable as data grows.

Recommended changes:
- Add explicit pagination to listing endpoints.
- Cap default page sizes.
- Revisit the search strategy for users; substring search on `name` will eventually become expensive.
- Consider database indexes or alternative search strategies depending on expected dataset size.

Why this matters:
- Unbounded reads are one of the easiest ways to produce accidental production load.
- Search patterns that work in dev can become slow under real data volume.

Relevant code areas:
- `/home/amaro/EvangelismoDigitalBackend/src/repositories/prisma/prisma-users-repository.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/http/controllers/users/`
- `/home/amaro/EvangelismoDigitalBackend/prisma/schema.prisma`

Acceptance criteria:
- List endpoints are paginated and capped.
- Search behavior is documented and measured.
- Indexing strategy matches the query patterns.

### 7. Define retention for operational data

Goal: avoid silent table growth that hurts writes, reads, backups, and maintenance.

Recommended changes:
- Set retention rules for authentication audit data.
- Set retention or archival strategy for outbox events.
- Decide whether cleanup happens in application code, cron jobs, or database maintenance routines.
- Document the policy explicitly before production.

Why this matters:
- Audit and event tables are append-heavy and can grow indefinitely.
- Without retention, production performance eventually degrades even if the app logic is correct.

Relevant code areas:
- `/home/amaro/EvangelismoDigitalBackend/prisma/schema.prisma`
- `/home/amaro/EvangelismoDigitalBackend/src/use-cases/authentication-audit/`
- `/home/amaro/EvangelismoDigitalBackend/src/use-cases/outbox-event/`

Acceptance criteria:
- There is a documented retention policy.
- Old operational records are cleaned up or archived safely.

### 8. Remove infrastructure leakage from core contracts

Goal: keep domain and application contracts independent from Prisma and Fastify.

Recommended changes:
- Replace Prisma-generated types in core repository contracts with local domain-friendly interfaces.
- Keep Fastify request/response types out of business logic and use-case contracts.
- Use explicit DTOs at the boundary and map them in infrastructure adapters.

Why this matters:
- This reduces coupling, improves testability, and makes the system easier to evolve.
- It also aligns the codebase with the Result Pattern architecture you are already moving toward.

Relevant code areas:
- `/home/amaro/EvangelismoDigitalBackend/src/core/contracts/repository/users-repository.interface.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/core/contracts/repository/forms-repository.interface.ts`
- `/home/amaro/EvangelismoDigitalBackend/src/http/`
- `/home/amaro/EvangelismoDigitalBackend/src/repositories/prisma/`

Acceptance criteria:
- Core contracts no longer import Prisma types.
- Application logic depends on abstractions only.
- Infrastructure mapping is explicit and local.

## What Already Looks Good

The following are worth preserving rather than rewriting:
- Global and route-based rate limiting is already in place.
- Redis outage logging is throttled instead of noisy.
- The cache layer already uses deduplication, negative caching, TTL jitter, and cancellation support.
- The outbox pattern is already the right foundation for async work.
- Structured logging already carries request and user context.
- Health checks already distinguish success and failure, even if they need to be broader.

## Suggested Order of Work

1. Fix public error exposure and observability sampling.
2. Add auth lockout and endpoint-specific throttling.
3. Move password-reset mail off the synchronous path.
4. Add metrics and dashboards.
5. Add Redis/worker HA strategy and leader election.
6. Add pagination/search caps and retention policies.
7. Remove Prisma/Fastify leakage from core contracts.

## Verification

- Run auth, mail, outbox, rate limit, and user repository tests after each change.
- Confirm production error responses never expose raw internal messages.
- Simulate Redis failure and mail provider failure to validate graceful degradation.
- Add smoke tests or checks for metrics endpoints before enabling Grafana dashboards.

## Decisions

- Treat Redis as a critical dependency and plan for failover, not just graceful degradation.
- Keep the outbox pattern as the main async boundary; do not bypass it for user-facing notifications.
- Preserve the current cache resilience patterns because they are already strong.
- Scope this document to production readiness, not a full architectural rewrite.

## Further Considerations

1. Decide whether password reset must be fully async before launch or can be phased in after initial production rollout.
2. Decide whether audit and outbox retention should be handled by the app, the database, or an external archival process.
3. Decide whether user search should remain simple substring matching or move to a dedicated full-text strategy later.
