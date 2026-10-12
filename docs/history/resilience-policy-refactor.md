# Resilience policies — replacing the hand-rolled retry helper

Branch: `feat/signal-abort-design-pattern` (follows P0–P5 of
[timeout-and-cancellation-model.md](timeout-and-cancellation-model.md))

## 0. Decisions taken (interview)

| Question          | Answer                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| Library           | **cockatiel**                                                                 |
| Scope             | Full policy stack, including the cache                                        |
| Version / runtime | **cockatiel 4 — upgrade the runtime to Node 22**                              |
| ESM bridge        | Keep cockatiel external; reach it from CJS via Node's `require(esm)` (§1)     |
| Backoff           | **Adopt jitter**                                                              |
| Cache policy      | Bulkhead **and** circuit breaker                                              |
| Timeouts          | `Deadline` stays authoritative                                                |
| Breaker rollout   | Env-gated, default on                                                         |
| Lint gate         | Fix all 30 legacy files, then rules → `error` — **after** the resilience work |
| Dependencies      | Patch and minor only                                                          |

## 1. The Node 22 upgrade, and why it also solves the ESM problem

cockatiel 4.0.0 declares `engines: { node: ">=22" }` and `"type": "module"` with
no `exports` map — it is ESM-only. This repo is CommonJS throughout: no `"type"`
field, `tsup … --format cjs`, `tsconfig` on `module: node16`.

Naively that means a bundling workaround. It does not, because of what we are
already changing: **Node 22.12+ enables `require()` of ESM by default.** With the
runtime on Node 22, `dist/server.js` can `require('cockatiel')` directly, so the
library stays an ordinary external dependency — the runner stage already runs
`npm ci --omit=dev`, so it is present in the production image.

The one compiler change this needs: **`module`/`moduleResolution` `node16` →
`nodenext`.** TypeScript deliberately keeps `node16` on pre-`require(esm)`
semantics and errors with TS1479 on a static `import` of an ESM-only package from
a CJS file; `nodenext` (TS ≥ 5.8, and we are on 5.9.2) permits it. No source
change, no dynamic `import()`, no bundler flag.

### Files the runtime pin touches

| File                          | Now                         | After                                                     |
| ----------------------------- | --------------------------- | --------------------------------------------------------- |
| `.nvmrc`                      | `20.19.0`                   | `22.23.2` (current 22 LTS)                                |
| `package.json` `engines`      | `>=20.0.0`                  | `>=22.12.0` — the `require(esm)` floor, not merely `>=22` |
| `Dockerfile:5` builder        | `node:20-slim`              | `node:22-slim`                                            |
| `Dockerfile:50` runner        | `node:20-slim`              | `node:22-slim`                                            |
| `.github/workflows/ci.yml` ×4 | `node-version-file: .nvmrc` | unchanged — follows `.nvmrc`                              |
| `scripts/ci-local.sh:48`      | reads `.nvmrc`              | unchanged — follows `.nvmrc`                              |
| `tsconfig.json`               | `module: node16`            | `module: nodenext`                                        |

The developer machine already runs Node v24.19.0, so local work is unaffected;
`ci-local.sh` only warns on a mismatch with `.nvmrc`, and 24 ≥ 22 satisfies the
new floor.

**This is the riskiest part of the change** — it moves the runtime under every
test, the Docker image, and CI at once. It is therefore its own phase (R0),
landed and fully verified before a line of cockatiel is written, so that a
failure is attributable to the runtime rather than to the policies. Verified
compatible with the pinned majors: Prisma 7, Fastify 5, BullMQ 5, Vitest 4.

## 2. What cockatiel owns, and what stays ours

The division follows the rule the last five phases were built on: **budgets are
derived, never invented.**

| Concern                                       | Owner                  | Why                                                                                                                              |
| --------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Attempt loop, backoff schedule, jitter        | **cockatiel**          | Exactly the naive part of the current helper                                                                                     |
| Failure-rate circuit breaking                 | **cockatiel**          | We have none today                                                                                                               |
| Concurrency limiting                          | **cockatiel** bulkhead | Replaces the hand-rolled `pendingFetches.size >= MAX_PENDING` check                                                              |
| **Budget derivation** (`min(cap, remaining)`) | **ours** (`Deadline`)  | The nesting invariant. Handing this to cockatiel's `TimeoutPolicy` would reintroduce D5 — a timeout invented rather than derived |
| Retry _eligibility_ (`failureMode`)           | **ours**               | Routing is already `failureMode`-driven with no `instanceof`; cockatiel just calls our predicate                                 |
| Error mapping to `AppError`                   | **ours**               | `FindNearestChurchesErrorMapper` stays the single translation point                                                              |

`Deadline.signal` is handed to `policy.execute(fn, signal)`, so cancellation
still originates in exactly one place.

## 3. The policy stack

**Provider layer.** `runWithRetries` keeps its exported signature — every call
site and every existing spec keeps compiling — and its body becomes:

```
wrap(
  retry(handleWhen(isRetryable), { maxAttempts, backoff: ExponentialBackoff }),
  circuitBreaker(handleWhen(isRetryable), { halfOpenAfter, breaker }),
)
```

Retry outermost, breaker inside: once a provider's circuit opens, the remaining
attempts are rejected immediately instead of each waiting on a dead upstream. The
per-attempt `Deadline.derive(...)` and the skip-if-it-cannot-fit floor
(`MIN_ATTEMPT_BUDGET_MS`) stay in our wrapper, ahead of `execute`.

**Cache layer.** `bulkhead(maxPendingFetches)` wraps the _shared_ fetch — not each
caller, or deduplicated callers would each consume a slot and change the
effective limit — plus a circuit breaker on the same execution.

**New error.** `CircuitOpenError` (`BrokenCircuitError` → `AppError`) carrying
`FailureMode.RETRYABLE`, so a fallback chain advances to the next provider, and a
new `TelemetryReason.CIRCUIT_OPEN` so it is distinguishable in metrics from an
ordinary provider failure. `BulkheadRejectedError` maps to the existing
`ServiceOverloadError`, preserving today's behaviour exactly.

## 3a. Two hazards found by reading cockatiel's source (R2)

Both were found by reading `RetryPolicy.js`, not the documentation, and both
would be silent behaviour changes.

**1. `maxAttempts` counts retries, not attempts.** The loop is
`if (!signal.aborted && retries < this.options.maxAttempts)` with `retries`
starting at 0, so cockatiel makes `maxAttempts + 1` calls. Our
`RunWithRetriesParams.maxAttempts` is documented as _total_ attempts ("2 means
two calls"), matching `IRaw*Provider.maxRetries`. The adapter must therefore pass
`ourMaxAttempts - 1`, floored at 0. Getting this wrong adds one extra upstream
call per provider per request — invisible in unit tests that only assert the
final Result, so it needs an explicit call-count assertion.

**2. The backoff delay is not cancellable.** cockatiel checks `signal.aborted`
_before_ starting a delay, then does a bare `await delayPromise`. An abort that
lands 10 ms into a 400 ms backoff is not observed until that delay completes —
the request outlives its budget by up to one backoff interval, which is precisely
the defect `request-outlives-its-budget.regression.spec.ts` guards.

The fix keeps `Deadline` authoritative, consistent with §2: supply a
`DelegateBackoff` that returns `min(exponentialDelay, deadline.remainingMs())`,
so a backoff can never extend past the budget. `dangerouslyUnref()` additionally
matches our existing `timer.unref()` convention, so a pending retry cannot hold
the process open during shutdown.

This settles the policy lifetime question in §9: the **retry policy is built per
call** (it is stateless, and its backoff must close over that call's `Deadline`),
while **only the circuit breaker is shared per provider** — which is what
cockatiel's own documentation requires of a breaker.

## 4. Behaviour changes, and why each is wanted

1. **Backoff gains jitter.** Today every client retries a failing provider on the
   identical `backoffMs * 2^(n-1)` schedule, so they re-hit it in lockstep and
   the recovery window is the worst moment. cockatiel's decorrelated-jitter
   `ExponentialBackoff` breaks the synchronisation. _Consequence:_ the exact-delay
   assertions in `deadline-retry.spec.ts` (100 ms, 200 ms) become bounds
   assertions — the delay must lie within `[initialDelay, maxDelay]` and grow —
   and the total must still respect the deadline, which is the property that
   actually matters.
2. **A tripped circuit fails fast with no attempt at all.** New: during an outage
   some requests return without an upstream call, logging `circuit_open` rather
   than a provider error.
3. **Concurrency rejection moves from a size check to a bulkhead.** Same
   `ServiceOverloadError`, same threshold; the D4/D11 regression guards keep
   their meaning unchanged.

## 5. Configuration (env-gated, default on)

Following the `HTTP_RATE_LIMIT_*` precedent — validated in `@env/index`, mirrored
in `.env.example`:

```
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_FAILURE_THRESHOLD=0.5     # trip above 50% failures
CIRCUIT_BREAKER_SAMPLING_WINDOW_MS=30000
CIRCUIT_BREAKER_MIN_THROUGHPUT=5          # ignore low-traffic noise
CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS=10000
```

Disabled ⇒ the stack is _composed_ without the breaker, so the flag costs nothing
per call rather than being a branch on the hot path.

## 6. Lint gate (after the resilience work)

1. Refactor the **30 files** carrying the remaining 55 findings (46 `complexity`,
   30 `max-lines-per-function`, 2 `max-depth`) — outbox processor, mail worker,
   Redis connections, analytics, presenters, in-memory repositories.
2. Flip `complexity` / `max-lines-per-function` / `max-depth` / `import/no-cycle`
   from `warn` to **`error`**.
3. `npm run lint` gains `--max-warnings 0`; `ci:local` and `ci.yml` then fail on
   any warning, deprecation, or unused export (`knip` already exits non-zero).

Sequenced file by file with the suite between each, so a regression is
attributable to one file rather than to a 30-file diff.

## 7. Dependency updates

Patch and minor within current majors. Majors deferred (`eslint` 9→10,
`bullmq` 5→6, `@vitest/coverage-v8` 4→5, `@amiceli/vitest-cucumber` 7→8,
`@fastify/rate-limit` 10→11, `cpf-cnpj-validator` 1→2, `@types/node` 24→26):
`bullmq` and `eslint` carry real migration surface and do not belong in the same
diff as a resilience refactor.

## 8. Phases

| Phase  | Content                                                                                                                                                                 | Behaviour change    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **R0** | **Runtime**: Node 22 in `.nvmrc`, both Dockerfile stages, `engines`; `tsconfig` → `nodenext`. No new dependency.                                                        | none                |
| **R1** | Add cockatiel 4; `CircuitOpenError`, `TelemetryReason.CIRCUIT_OPEN`, env vars. No wiring — proves the CJS↔ESM import works end to end (tsc, vitest, tsx, tsup, Docker). | none                |
| **R2** | `runWithRetries` internals → cockatiel `retry`. Jitter applied; timing specs become bounds specs.                                                                       | jitter              |
| **R3** | Circuit breaker on the provider policy stack.                                                                                                                           | fail-fast when open |
| **R4** | Cache: bulkhead + breaker replace the manual size check.                                                                                                                | none intended       |
| **R5** | Lint: 30 files, then rules → `error`, gates tightened.                                                                                                                  | none                |
| **R6** | Dependency patch/minor bump.                                                                                                                                            | none                |

Each phase carries the full gate — unit, integration, mutation on the changed
globs, and a green `ci:local` — and every defect fixed along the way gets a
proven-red regression spec.

## 9. Risks

- **The runtime move is the real risk, not the library.** R0 is deliberately
  dependency-free so that any breakage is attributable to Node 22 alone. The
  Docker smoke test in `ci:local` is the gate that matters here.
- **`require(esm)` is version-sensitive.** It is unflagged from Node 22.12; the
  `engines` floor is set there rather than at `>=22` so a 22.0–22.11 machine
  fails at install rather than mysteriously at runtime.
- **The breaker is shared state.** One `CircuitBreakerPolicy` instance per
  provider is required for it to mean anything; decorators are constructed per
  factory call and `makeFindNearestChurchesUseCase` memoises, so policy instances
  must be created once and reused deliberately.
- **Bulkhead placement.** Around each caller rather than the shared fetch would
  let deduplicated requests consume separate slots; the single-flight regression
  guard should catch it.
- **Jitter and fake timers.** Tests that advance a timer by an exact amount go
  flaky under jitter; those move to bounds assertions (§4.1).

## 10. Notes from execution

**The Stryker incremental cache reports false survivors.** `reports/mutation/`
`stryker-incremental.json` (gitignored, untracked) told R1 that a mutant
survived which a pre-existing test already killed; a run with a fresh
`--incrementalFile` scored the same file 98.28 % / 1 survivor instead of
96.55 % / 2. The stale cache was moved aside. Two consequences worth carrying
forward: any mutation score read from a warm cache is suspect, and the failure
direction that matters is the opposite one — a mutant recorded as _killed_ by a
test that has since been deleted would silently weaken the gate. Prefer a fresh
`--incrementalFile` whenever a score is being used as evidence.

**Confirmed by probing cockatiel rather than reading its docs:** `maxAttempts: 2`
makes **3** calls, and an abort landing inside a backoff delay causes the policy
to wait out the _whole_ delay **and then make one further call** before noticing
— so cancellation currently costs a rate-limit point, not merely latency. Both
are pinned in `src/providers/helpers/cockatiel-policy-contract.spec.ts`.

**Blocked:** `.env.example` is permission-denied to this agent, so the five
`CIRCUIT_BREAKER_*` vars in §5 must be added there by hand.

**Known equivalent mutants** (documented so they are not re-chased): the
`?? ''` / `|| ''` string literals in `find-nearest-churches-error-mapper.ts`, and
`if (factory)` in `deserializeAppError` — the surrounding `try/catch` already
produces the same result when the guard is removed. The guard is kept
deliberately: deleting it would make correct behaviour depend on a `TypeError`
from calling `undefined`.

### R2 execution notes

`runWithRetries` keeps its signature; only the body changed. Confirmed by
planting each mutant rather than by reading the code:

- Passing our `maxAttempts` straight through makes **4** tests fail
  ("called 2 times, but got 3") — the extra upstream call per request is guarded.
- Removing the budget clamp yields `expected 8974 to be less than or equal to 300`
  on a 300 ms budget.
- Removing the abort race hangs both defect tests to timeout while both
  counterweights still pass.

**A property was lost and recovered mid-refactor.** Delegating delays to cockatiel
silently dropped the immediate wake-up on an external abort, because cockatiel
checks the signal only _before_ a delay. Clamping bounds a budget that expires;
it does nothing for a disconnect that arrives earlier. Two decorator suites
caught it; the fix races the sequence against the deadline signal, and
`cancellation-ignored-during-backoff.regression.spec.ts` guards it.

`sleepUntil` was deleted with its 7 tests — cockatiel owns delays now, so it
became dead production code.

Mutation on `deadline-retry.ts`: **90.41 % → 100.00 %** (61 killed, 0 survivors).
Two `maxDelay` mutants initially looked equivalent; `Math.min(0, …)` is not — it
collapses the ceiling to `backoffMs`, which does bind — and is now killed by a
test asserting jitter may exceed one backoff unit. The remaining slack in that
ceiling is documented in the source.

### R3 execution notes

`wrap(retryPolicy, breaker)` — cockatiel's `p[0]` is the outermost policy, so
retry is outside and the breaker is consulted per attempt. Once a circuit opens,
the remaining attempts are rejected instantly rather than each waiting on an
upstream already known to be unhealthy.

**The memoisation is the feature.** `getProviderCircuitBreaker` keeps one
`CircuitBreakerPolicy` per provider name for the life of the process; a breaker
rebuilt per call observes a single request, never accumulates a failure rate and
can never open. Proven by deleting the cache: three tests fail, including
"stops calling a provider that keeps failing", because the circuit never trips.

`SamplingBreaker`, not `ConsecutiveBreaker`: these providers fail intermittently
under load, so "three in a row" would open on noise that a failure _rate_
ignores. `CIRCUIT_BREAKER_MIN_THROUGHPUT` stops one failure in a quiet period
from suspending a provider for everyone.

The breaker and the retry policy share one predicate (`isRetryableFailure`, in
its own module to avoid an import cycle). If they drifted, the breaker would
count failures the retry loop ignores — a NOT_FOUND, or a cancelled request —
and trip on healthy providers. Guarded by "does not trip on NOT_FOUND".

`CircuitOpenError` is constructed here rather than in the shared mapper, because
only this layer knows _which_ provider refused; the mapper can only say
"Unknown Provider".

Mutation: all three files 100 %, 0 survivors.

### R4 execution notes

The limiter moved from the _entry point_ to the _shared fetch_. That is a real
behaviour change, and an improvement: the old `tripIfOverloaded` ran before the
Redis read, so a full pending map refused cache **hits** too — work that costs
the upstream nothing. Now only a new fetch needs a slot.

**Placement is the whole risk, and proving it took two attempts.** A bulkhead
around each caller instead of each fetch would count callers and silently shrink
the limit. The first mutation I planted (on `tryJoinPendingFetch`) changed
nothing, which exposed that the ten-caller test deduplicates through
`startFetch`'s synchronous re-check, not through the join path — the mutation
was on a path the test never takes. Both paths now have a guard, and each fails
with "Bulkhead capacity exceeded" when its own limiter is moved onto callers.

`wrap(breaker, limiter)` — breaker outermost, so an open circuit rejects without
first occupying a slot. The breaker counts _returned_ failures via
`handleWhenResult`, because `executeFetch` reports trouble as `err(...)` rather
than by throwing, and counts only retryable ones: a NOT_FOUND is an answer and an
ABORTED request means the caller left. A bulkhead rejection cannot trip it —
cockatiel rethrows errors its filter does not handle, so they never reach the
tally (verified in `Executor.js`).

Breaker settings arrive through `ResilientCacheOptions` from the factory rather
than being read inside the cache, keeping `resilient-cache.ts` and
`church-lookup-cache-policy.ts` free of env, as that module's docblock requires.

Mutation: `resilient-cache.ts` 92.56 % → **94.80 %**, `church-lookup-cache-policy.ts`
100 %. One survivor remains in the new code — the `BrokenCircuitError` check in
`mapPolicyRejection` — equivalent because `executeFetch` is total, and documented
in place.

### R5 execution notes

All **55 warnings across 30 files** are gone, and the Layer 4 rules
(`complexity`, `max-lines-per-function`, `max-depth`, `import/no-cycle`) plus the
two import-hygiene rules are now **errors** repo-wide. `npm run lint` runs with
`--max-warnings 0`, so `ci:static`, `ci:local` and the PostToolUse hook all fail
on any finding. Proven by planting a complexity-8 function: `npm run lint` exits
1 with an _error_, not a warning.

Most of the work was deduplication rather than shuffling lines to satisfy a
counter:

- The outage-logging block was copied verbatim into all three Redis connections
  → `attachOutageLogging`.
- `clientIpOf` was implemented twice (analytics controller, request-lifecycle log)
  → one helper. Two layers disagreeing about a client IP is worse than none.
- Email/username uniqueness, church duplicate checks, session upsert attributes,
  user lookup fields: each was two or more copies of one rule.
- The Prisma and in-memory analytics repositories now build session attributes
  the same way, which is exactly the class of divergence that produced D19/D20.

**Templates are exempt from `max-lines-per-function`** (`src/templates/**`): those
functions are a single HTML literal with no branching, so the rule measures
markup, not logic. `complexity` and `max-depth` still apply. Flat config is
order-sensitive — the exemption has to come _after_ the Layer 4 block.

**Suite lock.** `scripts/ci-local.sh` and `.claude/hooks/gate.sh` now share
`/tmp/evangelismo-suite.lock` via `flock`. They ran the e2e suite against the
same Postgres and Redis, and overlapping runs produced three misleading failures
in one session. Verified: with the lock held, the hook skips (exit 0) and
`ci:local` refuses with a clear message (exit 1).

**Mutation, measured against a stashed baseline rather than assumed:**
`mail-worker.ts` 77.84 % → **83.41 %**, `outbox-processor.ts` 79.83 % → **80.87 %**
— extraction made more of the code reachable. `attach-outage-logging.ts` started
at 45 % because the old connection specs only asserted that handlers were
_registered_, never what they did; it now has its own spec and scores **95 %**.
Aggregate **90.48 %**, above the 85 gate.

### R6 execution notes

`.npmrc` sets `save-exact=true`, so every dependency is pinned and `Wanted`
always equals `Current` — `npm update` is a no-op here and each bump had to be
named explicitly, at the latest version _within its current major_.

**38 packages bumped**, majors excluded as agreed (`eslint` 10, `bullmq` 6,
`vitest`/`vite` 5/8, `typescript` 7, `ioredis` 6, `pino` 10, `nodemailer` 10,
`@types/node` 26, `fastify-plugin` 6, `fastify-metrics` 14,
`rate-limiter-flexible` 11, `@fastify/rate-limit` 11, `cpf-cnpj-validator` 2,
`lint-staged` 17, `globals` 17, `uuid` 14, `@amiceli/vitest-cucumber` 8,
`@types/supertest` 7, `@types/nodemailer` 8).

Three things worth recording:

- **`eslint-import-resolver-typescript` 4.4.4 → 4.4.5 was skipped.** It pulls
  `eslint-plugin-import-x`, whose peer range conflicts with
  `@typescript-eslint/utils@8.69.0`. `--force`/`--legacy-peer-deps` would install
  a tree npm considers broken; a patch bump is not worth that.
- **Knip 6.34 found `@types/node-cron` unused** — `node-cron` 4.x ships its own
  types (`dist/node-cron.d.ts`). Removed.
- **`prettier` 3.6.2 → 3.9.6 reformatted exactly one file**
  (`transactional-use-case.decorator.ts`, the line breaking of a long
  `implements` clause). It was bumped separately so its churn could be measured
  rather than mixed into the rest of the diff.

`nodemailer` stays on 7.0.13: the fix is v10, a major, so its six advisories
remain baselined in `osv-scanner.toml`. R6 does not change that exposure.

Verified: both entrypoints boot on the upgraded stack (API `/health` 200, metrics
9091/9092 200), and mutation on the resilience surface is unchanged —
`deadline.ts`, `deadline-retry.ts` and `provider-circuit-breaker.ts` at 100 %,
`resilient-cache.ts` at 94.80 %.

**R6 introduced one advisory and then closed it.** The bumps pulled
`tsup@8.5.1`, which depends directly on `esbuild@0.27.7` — GHSA-g7r4-m6w7-qqqr
(CVSS 2.5, dev-only), fixed in 0.28.1. `ci:local` caught it at the OSV stage.
Because it is _fixable_, it was fixed rather than baselined: an
`overrides: { tsup: { esbuild: '0.28.2' } }` entry, following the same scoped
convention already used for `qs`, `deepmerge-ts` and `mysql2`. tsup's own
`bundle-require` was already on 0.28.2, so the tree now resolves to a single
esbuild. Build verified after the override, and OSV reports "No issues found".
