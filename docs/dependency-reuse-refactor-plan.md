# Dependency-reuse audit & phased refactor plan

Applies the rule added to [`CLAUDE.md`](../CLAUDE.md) — *Prefer Existing Dependencies Over Custom
Implementations* — retroactively to the code that was written before it existed.

Scope: **technical implementations only.** Business logic (use-cases, domain rules, the Result/error
hierarchy as a *convention*, PT-BR message catalogues) is deliberately out of scope. Every finding below
is about machinery — plumbing that some library, somewhere, already solves.

Audit date: 2026-09-10. Branch `feat/cookies-enhancements` @ `a360d08`.
Surface reviewed: 349 non-test `.ts` files under `src/`, `package.json`, both entrypoints.

---

## Executive summary

**This codebase is already largely compliant with the new rule**, and in several places is a model of it.
That is the honest headline, and it changes the shape of this plan: there is no sprawling
not-invented-here problem to unwind, only a specific and finite list of gaps.

The pre-existing evidence of compliance:

| Concern | Library already used | Where |
|---|---|---|
| Retry / backoff / circuit breaker / bulkhead | `cockatiel` | `providers/helpers/deadline-retry.ts`, `resilient-cache.ts` |
| Outbound provider quotas | `rate-limiter-flexible` | `lib/infra/rate-limiter/redis-rate-limiter.ts` |
| Ingress rate limiting | `@fastify/rate-limit` + Redis store | `http/plugins/rate-limit.plugin.ts` |
| IP parsing & masking | `ipaddr.js` | `lib/analytics/truncate-ip.ts` |
| Cookie signing & rotation | `@fastify/cookie` | `http/cookies/cookie-secrets.ts` |
| Password hashing | `bcryptjs` | — |
| Queues & jobs | `bullmq` | `lib/workers/`, `lib/queue/` |
| Structured logging | `pino` | `lib/logger/` |
| Metrics | `prom-client` + `fastify-metrics` | `lib/metrics/`, `app.ts` |
| Validation | `zod` | `http/schemas/`, `env/` |
| CPF validation | `cpf-cnpj-validator` | `http/schemas/utils/cpf.ts` |

Two files deserve specific mention because they already *document* the rule's reasoning, and should be
cited as precedent in review:

- **`lib/analytics/truncate-ip.ts`** — its docblock records that a hand-rolled version shipped three
  defects (IPv6 `::` elision rejected, octal/short-form IPv4 producing three buckets for one host,
  IPv4-in-IPv6 mistaken for IPv4), and that `ipaddr.js` *was already in the lockfile the whole time* via
  `@fastify/proxy-addr`. This is the rule's argument, written by the codebase about itself.
- **`lib/infra/rate-limiter/redis-rate-limiter.ts`** — its "🔧 Por que rate-limiter-flexible" block
  chooses the library explicitly and says why, which is exactly what step 5 of the rule asks for.

**What the audit found: 13 actionable gaps in two categories, plus 5 decisions to record as rejections.**

- **Category A — an installed dependency already does it** (8 findings). Highest priority: zero new
  supply-chain surface, and the code being deleted is code no longer needing tests.
- **Category B — no dependency, but an established library exists** (5 findings). These add
  dependencies, so each carries a maintenance/licence/adoption assessment per step 5.
- **Category C — evaluated and rejected** (5 decisions). Recorded so the next reader can tell a
  considered judgement from an unexamined gap. This is the rule's step 4 doing its job.

One latent defect surfaced during the audit, in Finding A1 — flagged there rather than buried.

---

## Category A — an installed dependency already does this

### A1. `close-with-grace` already handles crash shutdown — and the duplicate handlers race

**Severity: highest in this document. Contains a latent defect.**

`close-with-grace@2.5.0` is installed and used at `src/server.ts:24`. Its own type definitions
(`node_modules/close-with-grace/index.d.ts`) show it already registers `uncaughtException` and
`unhandledRejection` itself, and already provides `delay` (the hard timeout before abrupt exit),
`onTimeout`, `onSecondError` and `onSecondSignal`.

`src/server.ts:43-49` then registers its **own** `process.on('unhandledRejection')` and
`process.on('uncaughtException')` handlers, and `src/lib/shutdown/crash-shutdown.ts` re-implements the
hard timeout (`CLEANUP_HARD_TIMEOUT_MS`, line 5) and the one-shot guard (`isShuttingDown`, line 11).

**The defect:** on an uncaught exception, *both* paths fire. close-with-grace invokes its callback with
`err` set (`server.ts:25-26` → `crashShutdown`), and the direct `process.on` at `server.ts:47` calls
`crashShutdown` again. The second call hits the `isShuttingDown` guard and goes straight to
`process.exit(1)` — **killing the first call's cleanup mid-flight**, before Redis connections quit, before
in-flight requests drain, and before the Sentry flush at `crash-shutdown.ts:52`. The exact failure this
machinery exists to prevent, caused by the machinery being doubled.

**Action:** delete `server.ts:43-49`; let close-with-grace be the sole registrant. Reduce
`crashShutdown` to the Sentry-flush-and-log body, driven from the `err` branch of the close-with-grace
callback, and move the hard timeout to close-with-grace's `delay` + `onTimeout`. Apply the same to
`src/worker.ts`.

**Regression test (required — this is a bug fix):** `crash-cleanup-interrupted-by-duplicate-handler.regression.spec.ts`.
Must be seen red against `a360d08`. Counterweight: a genuine *second* crash during shutdown must still
force-exit — that is `onSecondError`, and it must not be lost.

---

### A2. `bullmq` Job Schedulers replace `node-cron` — and dissolve the scale-out caveat

`src/worker.ts:56-75` carries a 20-line comment describing a known limitation: with more than one worker
pod, every pod runs `startOutboxCron` simultaneously, contending on the `DistributedLock`. The suggested
fix recorded there is to build leader election.

**Leader election does not need to be built.** BullMQ 5.81.4 — already installed, verified to export
`upsertJobScheduler` — provides Job Schedulers, which store scheduler metadata in Redis and enqueue one
delayed job per interval. Only one job instance is produced per scheduled tick *regardless of how many
processes upsert the same scheduler id*, and the job is then consumed by exactly one worker through the
queue's normal semantics.

This is Category A at its strongest: an installed dependency solves a problem the codebase has written
down as unsolved, and replaces both `node-cron` (a dependency that can then be dropped) and the
DistributedLock contention on the scheduled paths.

**Action:** convert the four schedules in `src/lib/infra/jobs/outbox-cron.ts` (`EVERY_FIVE_MINUTES`,
`MIDNIGHT_DAILY`, `DAILY_3AM`, `DAILY_4AM`) to `queue.upsertJobScheduler(<stable id>, { pattern }, ...)`
with a worker consuming them. Keep the cron *expressions*; they move, they do not change. Remove
`node-cron`. Rewrite the `worker.ts` caveat to describe what is now true — the Pub/Sub fan-out in
`OutboxSignal.subscribe` (`worker.ts:71-74`) remains a genuine multi-pod concern and must stay documented.

> Note: `docs/architecture-assessment-BullMQ-native-jobs-and-routing.md` §1.1 assessed BullMQ native
> features and marked `QueueScheduler` "N/A — removed in BullMQ v4+". That is correct but refers to a
> *different, removed* API. Job Schedulers (`upsertJobScheduler`) are its replacement and were not
> assessed. This finding complements that document rather than contradicting it.

---

### A3. `pino` `redact` — PII flows through logs unredacted

`src/lib/logger/index.ts:54-69` configures `level`, `formatters`, `mixin` and `serializers`, but not
`redact` — pino's built-in, JSON-path-based redaction.

For a codebase that truncates IPs for LGPD compliance (`truncate-ip.ts`), refuses to persist raw
user-agents (`user-agent-parser.ts` docblock), and hashes password-reset tokens before storage
(`use-cases/users/helpers/token-hash.ts`), unredacted logging is the gap that undoes the rest. CPF, email,
`authorization` headers and `set-cookie` all reach `logger` through request-lifecycle logging and error
serialization.

**Action:** add `redact: { paths: [...], censor: '[REDACTED]' }` to `baseConfig`. Minimum paths:
`req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, `*.password`, `*.cpf`,
`*.token`, `*.rawToken`, `*.email`. Zero new dependencies; a config object.

---

### A4. `cockatiel` + `nodemailer` pooling replace the hand-rolled SMTP breaker

`src/lib/mail/nodemailer-mail-sender.ts:64-78` counts `consecutiveFailures` and discards the cached
transporter past a threshold. That is a circuit breaker, hand-rolled, in a codebase that already depends
on `cockatiel` and uses its `circuitBreaker` + `SamplingBreaker` in two other places
(`providers/helpers/provider-circuit-breaker.ts`, `resilient-cache.ts:195-205`).

Separately, `nodemailer.createTransport` (line 21) omits `pool: true`, `maxConnections` and
`rateDelta`/`rateLimit` — nodemailer's own connection pooling and send-rate control, which is what the
transporter-recreation dance is approximating.

**Action:** enable nodemailer pooling; replace the failure counter with a `cockatiel` breaker configured
like the provider breakers. Both dependencies are already installed.

---

### A5. `ioredis` `defineCommand` — Lua scripts re-sent on every lock operation

`src/lib/infra/distributed-lock/distributed-lock.ts:32-55` defines `RELEASE_SCRIPT` and `RENEW_SCRIPT`
and invokes them with `redis.eval(...)` (lines 112, 142), which ships the full script body to Redis on
every call.

`ioredis` provides `defineCommand`, which registers the script once and calls it via `EVALSHA`, falling
back to `EVAL` automatically on `NOSCRIPT`. Same semantics, less bandwidth, and the call site becomes
`redis.releaseLock(key, token)` — which reads as what it does.

The lock's *algorithm* is correct and stays as-is (see Rejection C3).

---

### A6. `ms` — raw millisecond arithmetic

`ms@2.1.3` is installed and used throughout `src/env/index.ts` (`ms('10s')`, `ms('30s')`, `ms('5m')`).
It is not used at:

- `src/lib/infra/jobs/outbox-maintenance.ts:47` — `OUTBOX_CONSTANTS.RETENTION.DAYS * 24 * 60 * 60 * 1000`
- `src/lib/infra/jobs/analytics-retention.ts:91` — `target.days * MS_PER_DAY`
- `src/use-cases/users/forgot-password.ts:44` — `TOKEN_EXPIRES_IN_MINUTES * 60 * 1000`

Lowest-value finding in this document, listed for completeness. Fold it into whichever phase touches
those files; do not open a change for it alone.

---

### A7. `zod` is installed but not wired to the Fastify boundary

Covered in Finding B1, since the fix requires a new dependency. Recorded here because the *root* issue is
an installed dependency doing less work than it could: 20+ `schema.parse()` calls sit inside controller
bodies (`http/controllers/*/*.controller.ts`) rather than at the route definition, so validation is
manual, per-controller, and invisible to route metadata.

---

### A8. `OutboxSignal` bypasses the project's own Redis connection factory

`src/lib/infra/events/outbox-signal.ts:49-110` builds two `new Redis(...)` clients inline with a
hand-written `retryStrategy` (lines 87-95) and three hand-attached lifecycle listeners each.

`src/lib/redis/connections/` already provides connection factories with `attachOutageLogging`, and
`RedisOutageLogger` provides interval-suppressed outage reporting. The Pub/Sub clients get none of it —
so a Redis outage is loud on the cache and rate-limiter connections and quiet on the outbox signal.

Internal reuse rather than a library question, but the same principle and the same phase.

---

## Category B — no dependency installed; an established library exists

Each entry carries the step-5 assessment: maintenance, adoption, licence, compatibility.

### B1. `fastify-type-provider-zod` — validation at the boundary, and OpenAPI for free

**Gap.** No type provider is registered (`grep ZodTypeProvider` → no matches). Every controller parses by
hand: `register-user.controller.ts:12`, `find-nearest-churches.controller.ts:13`,
`track-event.controller.ts:46`, and 17 more. Consequences:

- Validation is not part of the route contract, so a controller can forget it and nothing catches that.
- No OpenAPI/Swagger document exists, and none can be generated — the API has no machine-readable contract.
- `ZodError` is handled reactively in `error-handler.plugin.ts` rather than by the framework.

**Library.** `fastify-type-provider-zod` v7.0.0 — Fastify 5, Zod 4 (uses Zod 4.2's `.encode()`/`.decode()`),
MIT, published ~Aug 2026, now under the `fastify/` GitHub org. Pair with `@fastify/swagger` +
`@fastify/scalar` for the rendered document. Compatible with the installed `fastify@5.12.3` /
`zod@4.5.4`.

**Action.** Register the provider, move each schema from the controller body to the route's
`schema: { body | querystring | params | response }`. The schemas in `http/schemas/` are reused as-is —
this relocates them, it does not rewrite them.

**Risk: the highest in this plan.** It touches every controller and every route, and response schemas
*strip* unlisted fields by default, which can silently shrink a payload the frontend depends on. Mitigate
by landing it route-group by route-group (`/health` → `/churches` → `/forms` → `/users` → `/analytics`),
with the acceptance suite (`features/*.feature`) as the contract check at each step. Do not batch.

---

### B2. `@fastify/helmet` — no security headers are set at all

**Gap.** `grep -i "helmet|Content-Security-Policy|X-Frame-Options|strict-transport" src/` returns
nothing. `src/app.ts` registers cors, rate-limit, cookie and jwt — no security headers plugin. Responses
carry no HSTS, no `X-Content-Type-Options: nosniff`, no frame-ancestors policy.

For a codebase with a SonarQube "0 open issues" gate, njsscan, Semgrep and Snyk in CI, this is a
conspicuous hole — and one no scanner flags, because it is an *absence*.

**Library.** `@fastify/helmet` — Fastify core org, MIT, tracks Fastify 5, wraps `helmet` (the
de-facto standard, ~3M weekly downloads).

**Action.** Register early in `app.ts`, after cors. Set `contentSecurityPolicy` deliberately: this is a
JSON API, so `default-src 'none'; frame-ancestors 'none'` is the right posture — but the metrics server
(`metrics-server.ts`) and any docs UI from B1 need their own treatment.

---

### B3. `@fastify/under-pressure` — hand-rolled health check, and no load shedding

**Gap.** `src/http/controllers/health-check/health-check.controller.ts` hand-computes
`process.memoryUsage()`, formats four values to MB, pings the DB with `SELECT 1`, and times it. What it
cannot do is what actually matters under load: measure **event loop delay**, and **shed load**.

The codebase invests heavily in bounded concurrency downstream — cockatiel bulkheads in
`resilient-cache.ts:173`, per-provider breakers, request deadlines — but has no admission control at the
front door. Under saturation it accepts everything and degrades everywhere.

**Library.** `@fastify/under-pressure` — Fastify core org, MIT, Fastify 5 supported. Provides
`maxEventLoopDelay`, `maxHeapUsedBytes`, `maxRssBytes`, `maxEventLoopUtilization`, automatic 503 on
breach, plus `healthCheck` + `healthCheckInterval` + `exposeStatusRoute`.

**Action.** Register in `app.ts`; move the `SELECT 1` into its `healthCheck` callback; keep the
custom controller only if the memory-report shape is consumed by something (verify before deleting —
it may be wired into the deploy smoke test at `scripts/ci-local.sh`).

---

### B4. Email templates: unescaped interpolation, duplicated markup

**Gap.** `src/templates/**/*-html.ts` are raw template literals. `contact-user-html.ts:12` interpolates
`${name}` **directly into HTML with no escaping** — and `name` is user-submitted, arriving through the
forms submission path. A name containing `<` produces broken markup at best; the same pattern in the
`*-staff` templates puts attacker-controlled text into an email a staff member opens.

Secondly, the same `<table style="font-family: arial">` scaffold with the same orange header is
copy-pasted across four template families, with the text-only variants duplicating the copy a second time.

**Options assessed:**

| Library | Licence | Fit |
|---|---|---|
| **`mjml`** | MIT | Industry standard (~18k stars); compiles to Outlook-safe table HTML via `mjml2html()`, provider-agnostic, hands a string to nodemailer. **Recommended** — it solves the client-compatibility problem the hand-written tables are attempting. |
| `eta` | MIT | Tiny, TS-native, auto-escaping. Solves escaping and duplication but not email-client quirks. Viable if the tables are considered good enough. |
| `react-email` | MIT | Best DX *if the team writes React*. This is a Fastify backend with no React anywhere — it would introduce a rendering runtime for four emails. Rejected on compatibility. |
| `maizzle` | MIT | Build-time Tailwind→HTML. Good fit for low-variation transactional mail, but adds a build step to `tsup`. Second choice. |

**Also:** `nodemailer-html-to-text` can derive the plaintext part from the HTML, deleting the
`*-text.ts` files and the copy duplicated inside them.

**Action.** Adopt MJML with one shared layout; escape every interpolation. Because escaping changes
output, snapshot the current rendered HTML *before* the change to prove only the escaping differs.

---

### B5. The promise-timeout helper exists three times

Three implementations of "await this, but give up when a signal fires":

- `resilient-cache.ts:110-149` — `whenExpired` + `withinBudget`
- `deadline-retry.ts:113-125` — `settleFirst`
- `metrics-server.ts:29-39` — `withTimeout`

The third **leaks a timer**: its `setTimeout` is never cleared, so every successful metrics scrape holds
a live 2-second timer to completion. Harmless in effect, but it is the class of bug the other two avoid
by hand — which is the argument for having one of these, not three.

`jscpd` does not catch this (3% gate, and these are structurally different) and neither does SonarQube's
token-level CPD — the same blind spot `CLAUDE.md` already documents for the provider chains.

**Action — no new dependency needed.** Node 22's `node:events` exports `addAbortListener(signal, listener)`,
which returns a `Disposable` and is precisely what `whenExpired` hand-rolls, including the cleanup. Build
one `src/core/shared/abort-race.ts` on it, and have all three call sites use it. `p-timeout` was
considered and is unnecessary once `Deadline` supplies the signal.

---

## Category C — evaluated and rejected

Step 4 of the rule permits custom code when libraries were evaluated and found wanting. These are those
evaluations, recorded so they are not silently redone.

### C1. `neverthrow` vs `core/shared/result.ts` — **REJECT**

`neverthrow` is the established Result library for TypeScript. The local implementation is 23 lines
(`ok`/`err`/`isOk`/`isErr`) and is imported by essentially the whole codebase.

Rejected because: neverthrow's value is its *combinator* API (`.map`, `.andThen`, `ResultAsync`), which
is a different programming style from the `if (isErr(x)) return x` propagation `CLAUDE.md` mandates as
the house convention. Adopting it means either a mechanical rename that gains nothing, or rewriting
control flow in ~349 files. The 23 lines being replaced have no defect and no maintenance cost.

**Re-evaluate if:** the team decides it wants combinator-style chaining as the convention. That is a
style decision, not a dependency decision.

### C2. `@epic-web/cachified` vs `ResilientCache` — **REJECT as a replacement**

`@epic-web/cachified` is actively maintained and does TTL, stale-while-revalidate, and parallel-fetch
protection over any key/value store.

Rejected because `ResilientCache` (565 lines) is not primarily a cache: it is a cache *fused with* this
codebase's `Result`/`AppError` vocabulary, `failureMode`-driven negative-TTL policy
(`cache-failure-policy.ts`), detached-`Deadline` single-flight semantics, and cockatiel breaker/bulkhead
composition. cachified models none of those. A replacement would keep ~70% of the file as an adapter
while losing the mutation-tested guarantees around caller cancellation.

**Take the idea, not the dependency:** cachified's stale-while-revalidate is genuinely absent here and
worth implementing natively if provider latency becomes a problem.

### C3. `redlock` vs `DistributedLock` — **REJECT**

Rejected on two grounds. First, `redlock` implements the multi-node Redlock algorithm; this deployment
has one Redis instance, so the algorithm's guarantees do not apply and its quorum machinery is pure
overhead. Second, Redlock's safety is actively disputed in the distributed-systems literature.

The existing implementation is a textbook-correct single-instance lock: `SET NX PX`, ownership token, and
Lua-atomic compare-and-delete / compare-and-renew. It is right. Only its transport changes (Finding A5).

### C4. `ua-parser-js` vs `user-agent-parser.ts` — **REJECT, and the docblock is now understated**

`user-agent-parser.ts` explains that it is hand-rolled because only three coarse buckets are needed and a
library would add a monthly-updated regex database.

That reasoning holds, and there is now a second, stronger one the docblock predates: **ua-parser-js v2
dropped MIT for dual AGPLv3 + commercial "PRO" licensing.** AGPLv3 is incompatible with a closed-source
backend without a paid licence. v0.7.x/v1.x remain MIT but receive minimal updates — and a
minimally-updated regex database is the one thing a UA parser must not be. Matteo Collina (Node.js TSC)
publicly called it a rug pull and forked rather than pin.

**Action: none to the code — but add the licence finding to the docblock**, because "we chose not to" and
"we cannot without buying a licence" are different facts, and the next reader deserves the second one.

**Better direction if this ever needs to improve:** UA Client Hints (`Sec-CH-UA-Platform`,
`Sec-CH-UA-Mobile`) — the browser reports platform and mobile-ness as structured headers, no parsing and
no regex database. Progressive enhancement over the existing fallback.

### C5. `undici` / native `fetch` vs `axios` — **REJECT**

Node 22 ships `fetch` and `undici`, with native pooling and real `AbortSignal` support. But `axios@1.20.0`
is actively maintained, and this codebase's error classification is built on it —
`find-nearest-churches-error-mapper.ts` branches on `isAxiosError`, and the provider decorators map
`AxiosError` shapes to `failureMode`. Switching rewrites the error taxonomy the whole resilient-provider
chain routes on, for no capability gain. `lib/http/https-agent.ts` already provides keep-alive pooling.

> Unrelated dead code noticed while reading it: `https-agent.ts:37-41` re-checks `agents.get(key)` and
> rebuilds on `undefined` immediately after `agents.set(key, ...)` on line 34. That branch is
> unreachable. Sweep it in Phase 1.

---

## Phased implementation plan

**Every phase obeys the per-change gate in `CLAUDE.md` — all nine steps, per change, not per phase.**
`ci:local` must be run serially and must exit 0 before a phase is considered done. Phases are ordered by
value ÷ risk, and each is independently shippable and revertible.

### Phase 0 — Baseline (no `src/` changes)

Preparation only, so later phases have something to compare against.

1. Capture a clean baseline: `npm run ci:local`, `npm run sonar`, `npm run security:scan`,
   `npm run test:coverage`. Archive `reports/`.
2. Snapshot the rendered output of all five email templates to fixture files — Phase 4 needs a
   before/after diff to prove escaping is the only change.
3. Create `docs/dependency-decisions.md` as an append-only ADR log, seeded with the five Category C
   rejections. This is what step 5 of the rule needs to be auditable later.

**Gate:** everything green *before* any change, so a later red result is attributable.

---

### Phase 1 — Reclaim installed dependencies (low risk, includes the bug fix)

Pure deletion and configuration. No new dependencies. Highest value-to-risk ratio in the plan, and it
carries the only defect found.

| Step | Finding | Files |
|---|---|---|
| 1.1 | **A1** — delete duplicate crash handlers; fix the cleanup-interrupt defect | `server.ts:43-49`, `worker.ts`, `lib/shutdown/crash-shutdown.ts` |
| 1.2 | **A3** — pino `redact` | `lib/logger/index.ts` |
| 1.3 | **A5** — `defineCommand` for the lock scripts | `lib/infra/distributed-lock/distributed-lock.ts` |
| 1.4 | **A8** — route `OutboxSignal` through the connection factories | `lib/infra/events/outbox-signal.ts` |
| 1.5 | **A6** — `ms()` in the three files above, while they are open | `outbox-maintenance.ts`, `analytics-retention.ts`, `forgot-password.ts` |
| 1.6 | **C5 addendum** — remove the unreachable branch | `lib/http/https-agent.ts:37-41` |
| 1.7 | **C4 addendum** — record the AGPL finding in the docblock | `lib/analytics/user-agent-parser.ts` |

**Required tests.** 1.1 ships `crash-cleanup-interrupted-by-duplicate-handler.regression.spec.ts`,
proven red at `a360d08`, with a counterweight asserting a second crash *during* shutdown still
force-exits. 1.2 ships assertions that each redacted path is censored **and** that a non-PII field
adjacent to it survives — a redact config that over-matches is as much a defect as one that under-matches.
1.3 must assert the `NOSCRIPT` fallback path, not just the happy one.

**Exit:** `test:mutation:scoped` ≥ 85% on every changed glob; `ci:local` exit 0.

---

### Phase 2 — HTTP boundary hardening (highest value; B1 is the highest risk)

**Split into two independently shippable changes. Do not combine.**

**2a — Security headers and load shedding** (low risk, immediate value):
- **B2** `@fastify/helmet`, registered after cors in `app.ts`. CSP set for a JSON API.
- **B3** `@fastify/under-pressure`; move `SELECT 1` into its `healthCheck`. Verify first whether the
  memory-report payload is consumed by `scripts/ci-local.sh`'s smoke test before touching the controller.
- e2e must assert the new headers on a real response, and that a 503 is returned under simulated
  event-loop pressure.

**2b — Zod type provider + OpenAPI** (highest risk in the plan):
- **B1** `fastify-type-provider-zod@7` + `@fastify/swagger` + `@fastify/scalar`.
- **Land one route group per change, in this order:** `/health` → `/churches` → `/forms` → `/users` →
  `/analytics`. Five separate changes, five full gates. `/health` first because it is the smallest
  blast radius; `/analytics` last because it has the most schemas.
- **The specific hazard:** response schemas strip unlisted fields silently. For each group, diff the
  serialized response against the pre-change acceptance-test fixtures before moving on. The
  `features/*.feature` suite is the contract check — if a step passes but a field vanished, the feature
  file was under-specified and needs strengthening first.
- `error-handler.plugin.ts`'s `ZodError` branch stays: it is now the framework's error path, not a
  manual one, and its tests must be updated to reflect that rather than deleted.

---

### Phase 3 — BullMQ Job Schedulers (medium risk, retires a documented limitation)

**A2.** The payoff is architectural: it removes `node-cron`, removes lock contention on scheduled work,
and turns the `worker.ts:56-75` scale-out caveat from a warning into a solved problem.

1. Introduce a `maintenance` queue and its worker.
2. Convert schedules one at a time, in ascending order of consequence:
   `DAILY_4AM` (analytics retention) → `DAILY_3AM` (outbox purge) → `EVERY_FIVE_MINUTES` →
   `MIDNIGHT_DAILY`. One change per schedule.
3. Use stable scheduler ids so redeploys upsert rather than duplicate. Keep the existing cron expressions
   verbatim.
4. Remove `node-cron` only after the last schedule migrates; confirm with `npm run knip`.
5. Rewrite the `worker.ts` caveat: scheduled work is now safe under N pods; **the `OutboxSignal.subscribe`
   fan-out is not**, and must remain documented as the open item.

**Per-artefact requirement (`CLAUDE.md`):** each converted job handler needs unit cases for success,
`RETRYABLE` failure, permanent failure, and idempotent re-delivery, plus an assertion that its Prometheus
counter moved. `collectMetricsOutboxCronRuns` labels must survive the move or the Grafana panels break —
assert on the label values, not just the counter.

**Integration test:** two scheduler instances upserting the same id must produce **one** job per tick.
That is the whole claim of this phase; it must be proven, not assumed.

---

### Phase 4 — Email templating (medium risk, closes an injection vector)

**B4**, plus **A4** since both touch the mail path.

1. Add `mjml`; build one shared layout carrying the header/footer currently copy-pasted four times.
2. Migrate one template family per change. Escape every interpolation.
3. Diff each rendered output against the Phase 0 snapshot. **Only escaping and whitespace may differ**;
   anything else is a regression, not an improvement.
4. Add `nodemailer-html-to-text`; delete the `*-text.ts` files once the derived plaintext is verified
   acceptable for each family.
5. **A4**: enable nodemailer `pool` + `rateDelta`; replace the `consecutiveFailures` counter with a
   `cockatiel` breaker.

**Regression test:** a form submission with a name containing `<script>` must produce escaped output in
both the user and staff templates. Counterweight: a name with a legitimate apostrophe or accented
character (`João D'Ávila`) must render unchanged — over-escaping mangles Brazilian names, which is a real
defect in a PT-BR product.

**`jscpd` should measurably improve.** Record the before/after duplication percentage as evidence.

---

### Phase 5 — Consolidate the abort/timeout primitive (low risk, no new dependency)

**B5.** Build `src/core/shared/abort-race.ts` on `node:events`'s `addAbortListener`. Migrate the three
call sites one per change: `metrics-server.ts` first (it has the timer leak and the least coupling), then
`deadline-retry.ts`, then `resilient-cache.ts`.

**`resilient-cache.ts` last, and treat it as the riskiest edit in this phase.** `CLAUDE.md` records that
single-flight has already broken once here because an extracted helper introduced a microtask boundary —
`startFetch` (line 288) depends on its `get`/`set` running in one microtask with no `await` between them.
The new helper must not be awaited anywhere on that path. Re-run the single-flight tests specifically, and
re-run mutation testing on the whole file rather than the diff.

---

### Phase 6 — Standing decisions

Not a refactor. `docs/dependency-decisions.md` becomes the durable record, and each rejection gets an
explicit re-evaluation trigger:

| Decision | Re-evaluate when |
|---|---|
| C1 `neverthrow` | The team adopts combinator-style chaining as the house convention |
| C2 `cachified` | Provider latency makes stale-while-revalidate necessary — implement natively, keep the rejection |
| C3 `redlock` | Redis becomes a multi-node cluster where the algorithm's guarantees actually apply |
| C4 `ua-parser-js` | Never on licence grounds; move to UA Client Hints if fidelity must improve |
| C5 `undici` | axios becomes unmaintained, or the error taxonomy is being rewritten anyway |

Going forward, any new technical implementation records its step-1/step-2 evaluation here before the code
lands — which is what makes the `CLAUDE.md` rule enforceable rather than aspirational.

---

## Summary table

| # | Finding | Category | Phase | Risk | New dep |
|---|---|---|---|---|---|
| A1 | Duplicate crash handlers race, interrupting cleanup | A | 1 | Low | — |
| A3 | No pino `redact` — PII in logs | A | 1 | Low | — |
| A5 | Lua via `eval` instead of `defineCommand` | A | 1 | Low | — |
| A8 | `OutboxSignal` bypasses connection factories | A | 1 | Low | — |
| A6 | Raw ms arithmetic | A | 1 | Trivial | — |
| B2 | No security headers | B | 2a | Low | `@fastify/helmet` |
| B3 | Hand-rolled health check; no load shedding | B | 2a | Low | `@fastify/under-pressure` |
| B1 | No Zod type provider; no OpenAPI | B | 2b | **High** | `fastify-type-provider-zod`, `@fastify/swagger` |
| A2 | `node-cron` + lock contention vs Job Schedulers | A | 3 | Medium | — (removes `node-cron`) |
| B4 | Unescaped HTML in email templates | B | 4 | Medium | `mjml`, `nodemailer-html-to-text` |
| A4 | Hand-rolled SMTP breaker; no pooling | A | 4 | Low | — |
| B5 | Promise-timeout helper ×3, one leaking a timer | B | 5 | Low | — |
| A7 | Manual `.parse()` in controllers | A | 2b | (see B1) | — |

**Net dependency change:** +5 (`@fastify/helmet`, `@fastify/under-pressure`,
`fastify-type-provider-zod`, `@fastify/swagger`/`@fastify/scalar`, `mjml`+`nodemailer-html-to-text`),
−1 (`node-cron`). Four of the five additions are Fastify-core or industry-standard MIT packages.

---

## Sources

- [fastify-type-provider-zod](https://github.com/fastify/fastify-type-provider-zod) · [npm](https://www.npmjs.com/package/fastify-type-provider-zod) · [setup docs](https://marcalexiei.github.io/fastify-type-provider-zod/setup.html)
- [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/)
- [@fastify/under-pressure](https://github.com/fastify/under-pressure) · [npm](https://www.npmjs.com/package/@fastify/under-pressure) · [Nearform: managing load in Node.js](https://www.nearform.com/blog/managing-load-in-node-js-with-under-pressure/)
- [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers/) · [Manage Job Schedulers](https://docs.bullmq.io/guide/job-schedulers/manage-job-schedulers) · [Repeatable jobs](https://docs.bullmq.io/guide/jobs/repeatable)
- [ua-parser-js AGPLv3 + PRO announcement](https://github.com/faisalman/ua-parser-js/issues/680) · [Socket: ua-parser-js drops MIT](https://socket.dev/blog/ua-parser-js-drops-mit-license) · [LogRocket: UA detection and the licence change](https://blog.logrocket.com/user-agent-detection-ua-parser-js-license-change/)
- [cachified](https://github.com/epicweb-dev/cachified) · [npm](https://www.npmjs.com/package/@epic-web/cachified)
- [React Email vs MJML vs Maizzle (2026)](https://www.pkgpulse.com/guides/react-email-vs-mjml-vs-maizzle-email-template-2026) · [Best email libraries for Node.js (2026)](https://www.pkgpulse.com/guides/best-email-libraries-nodejs-2026)
