# Timeout & cancellation model — refactor plan

Branch: `feat/signal-abort-design-pattern`

Supersedes the timeout portions of
[architecture-assessment §1.3(2) / §4.2](architecture-assessment-BullMQ-native-jobs-and-routing.md) and
[analise.md](analise.md), whose conclusions this plan adopts.

---

## 1. The problem

There is exactly one clock in the entire request path, and it is in the wrong place: the
`ResilientCache`'s `fetchTimeoutMs`. Nothing above it can bound it, nothing below it derives from it.

```
GET /churches/nearest                     no signal, no deadline, no Fastify requestTimeout
  └─ FindNearestChurchesUseCase.execute({cep})          signature has no signal
      └─ ResilientCache.getOrFetch(key, fetcher)        called with NO parentSignal
          │  redis.get                                  OUTSIDE the budget (ioredis commandTimeout 1000ms)
          │  ─── budget starts: AbortSignal.timeout(15_000) ───
          ├─ address chain   3 providers x 2 attempts, axios 2000-2500ms, backoff sleeps
          ├─ geocode chain   3 strategies x 2 providers x 2 attempts, axios 2500-3000ms
          ├─ KNN / Prisma                               no signal at all
          └─ routing         axios 3000ms, no retry
          │  redis.set                                  OUTSIDE the budget
```

### Catalogued defects

| # | Defect | Evidence |
|---|---|---|
| D1 | **No request-level deadline exists.** The controller never creates a signal; Fastify has no `requestTimeout`; client disconnect cancels nothing. | `find-nearest-churches.controller.ts:21`, `app.ts:23-27` |
| D2 | **Two independent timers for one budget** — `AbortSignal.timeout(15s)` *and* a separate `setTimeout(15s)` racing promise with its own abort listener. | `resilient-cache.ts:258` vs `:272-294` |
| D3 | **The budget doesn't bound the whole operation.** `redis.get` runs before the clock starts, `redis.set` after it stops: worst case ≈ 15s + 2×1s = 17s. | `resilient-cache.ts:103`, `:246` |
| D4 | **Cross-request cancellation bleed.** The deduped in-flight promise is bound to the *first* caller's `parentSignal`; caller B inherits caller A's cancellation and cannot cancel its own. Latent only because no parent signal is ever passed today. | `resilient-cache.ts:97-100`, `:129-135` |
| D5 | **Child timeouts don't derive from the parent.** Fixed axios timeouts + retries + exponential backoff: nominal worst case ≈ 25.8s under a 15s ceiling. A provider with 200ms of budget left still starts a 3000ms request. | `analise.md:7-15` |
| D6 | **Rate-limit points consumed before the abort check** — an expired request still burns ViaCEP/Nominatim quota (1 pt/s each). | `resilient-address-provider.decorator.ts:28` before `:36`; same in geo `:45`/`:53`, routing `:34`/`:42` |
| D7 | `tryConsume()` takes no signal and sits outside the budget. | `redis-rate-limiter-connection.ts:17` |
| D8 | **Deadline expiry and per-attempt timeout are the same error** (`TimeoutExceededError`, `RETRYABLE`). A chain cannot tell "the budget is gone, stop" from "this provider was slow, try the next". | `timeout-exceeded-error.ts:13`, `resilient-geo-provider.ts:98` |
| D9 | Both chains fabricate `new AbortController().signal` when given none — a signal that can never fire, masking "no budget" as "has a budget". | `resilient-geo-provider.ts:38`, `resilient-address-provider.ts:35` |
| D10 | **The KNN/Prisma leg was uncancellable and unbudgeted** — the driver cannot cancel a statement already executing, so nothing bounded it. **Fixed in P4**: the use-case derives `min(KNN_BUDGET_MS, remaining)` and the repository enforces it with `SET LOCAL statement_timeout` inside a transaction, taken only when a ceiling is requested so unbounded callers keep the cheaper plain query. | `find-nearby-churches-knn-use-case.ts`, `prisma-churches-repository.ts` |
| D11 | A result arriving just before expiry is discarded **and** not cached. | `resilient-cache.ts:241-246` |
| D12 | The retry + `sleep` body is duplicated verbatim in three decorators; routing has no retry at all. | three `*.decorator.ts` |
| D13 | **`ResilientCache`'s built-in negative-cache default was `failureMode === 'RETRYABLE'`, i.e. everything else was cached** — including an untagged `SystemError` and `ABORTED`. Latent only because the single instance always passes the custom `isRetryableChurchLookupError`. Any cache created without an override would have pinned a `DeadlineExceededError` — a pure clock event saying nothing about the key — into Redis for the full negative TTL. **Fixed in P0**: the default is now `failureMode !== NOT_FOUND && failureMode !== PERMANENT`. | `resilient-cache.ts` |
| D14 | **`DeadlineExceededError` extends `InfrastructureError`, so every expiry was a `Sentry.captureException` + `logger.error`.** Once P3 wires client-disconnect cancellation, every user who navigates away — and every request during a provider slowdown — would have become a Sentry event, exhausting the quota with events nobody can action. **Fixed in P0**: the handler treats `ABORTED` as expected load-shedding — `warn`, no capture — relying on the `deadline_exceeded` metric label instead. Required refactoring the handler onto a dispatch table, since it breached Layer 4 (68 lines, complexity 15) and the hook blocks edits to files that do. | `error-handler.plugin.ts` |
| D21 | **`ResilientCache` invented a 12s fetch cap when none was given.** The last surviving instance of the thing this whole branch removed everywhere else — a layer picking a timeout out of the air — and by then 12s was *longer than the entire 8s request budget* it sits inside, so any future cache built without an explicit cap would have silently broken the ladder. Harmless in production (the one real cache always passed 7.5s) and therefore invisible. **Fixed in P5**: `fetchTimeoutMs` is now required, so a cache that cannot say how long its fetch may take does not get to guess. | `resilient-cache.ts` |
| D20 | **The in-memory double's duplicate check was looser than production's, and its name lookup case-sensitive when the database's is not.** `findByParams` required name **AND** lat **AND** lon to match, where the Prisma predicate is `name OR (lat AND lon)`; `findByName` compared exactly, where the SQL compares `lower(trim(name))`. Two existing tests encoded the double's behaviour rather than the system's — "allows creating churches with different names at same location" (production rejects it) and "should be case-sensitive when searching by name" (production is not). **Fixed in P4**: the double now mirrors the SQL predicate, including six-decimal coordinate rounding, and both tests were corrected to the real rule with the history in a comment. Found only by writing tests for the double itself. **Durably resolved**: `churches-repository.contract.ts` now holds one set of scenarios executed against *both* implementations — the double as a unit test, and Prisma against real Docker Postgres — so alignment is proven rather than transcribed. Re-introducing the old `AND`/case-sensitive predicate fails 7 contract tests. | `in-memory-chuches-repository.ts`, `churches-repository.contract.ts` |
| D19 | **The in-memory repository enforced a 50km radius the Prisma one never applied.** `FindNearbyParams.maxRadiusMeters` was honoured by the test double and silently ignored by the real query, and no production caller ever set it — so a unit test asserting "churches beyond 50km are filtered out" passed against a fiction while production returned them. **Fixed in P4**: the phantom field is gone from the contract and the double, and the test now pins the real behaviour (nearest-first, no distance cut-off) with the history in a comment. **Resolved by the user**: cap on *routed* distance rather than straight-line, applied after the routing step, with a ceiling per `RoutingProfile` (`ROUTING_MAX_DISTANCE_KM` — 10km on foot, 50km by bicycle, 150km by car). Routed rather than geometric because the two diverge exactly where it matters: a church 5km across a river can be a 30km walk. Previously the outcome depended on whether Stadia happened to be able to route that far, which made the boundary arbitrary. | `churches-repository.interface.ts`, `in-memory-chuches-repository.ts` |
| D18 | **`Deadline.linkedTo()` has no production caller.** It bridged the cache's `AbortSignal` in P1; P2 removed that bridge and P3 uses the `linkedTo` *option* on `Deadline.in()`. **Resolved in P3: kept, deliberately.** Unlike D16 — 47 lines of untested, complexity-10 code that breached the lint gate — this is a 3-line, 100 %-mutation-covered factory that names a first-class concept in the model (*cancellable but unbounded*), and it is the vocabulary 35 call sites across 14 spec files use to express "a caller who can go away". Removing it would churn all of them into the strictly less readable `Deadline.in(Infinity, { linkedTo })` for no runtime gain. It is also the natural constructor for a worker whose only cancellation is shutdown. | `core/shared/deadline.ts` |
| D17 | **`createTimeoutRace`'s abort reason is always discarded.** It carefully builds `new TimeoutExceededError(effectiveSignal.reason \|\| 'Timeout Exceeded')`, but `mapFetchThrow` catches it and constructs a *fresh* `TimeoutExceededError` from `parentSignal.reason`, so the original reason never reaches a caller. Benign today (both paths say "timeout"), but it is why the reason is untestable and it will mislead the first person who tries to thread a richer cancellation reason through. P2 deletes `createTimeoutRace` outright, which resolves it. | `resilient-cache.ts` |
| D16 | **`IRawChurchRoutingProvider.fetchRawDistance` (singular) was dead code.** Declared on the contract, implemented in `StadiaChurchRoutingProvider` (47 lines, cyclomatic 10) and stubbed in two specs, but no production code called it — the decorator only uses the batched `fetchRawDistances`. Knip did not flag it because an implemented interface method counts as used. **Fixed in P1**: removed the contract method, the implementation, its two orphaned helpers (`extractDistanceKm`, `StadiaRouteResponse`), the now-unused `apiUrl` config field and its `STADIA_MAPS_API_URL` env entry. No test was lost — every existing test already went through `fetchRawDistances`. The file now passes Layer 4, which it had never done. | `stadia-church-routing-provider.ts` |
| D15 | **`resilient-address-provider.integration.spec.ts` was timing-dependent**: it drained a 1-token/1-second Redis bucket, then let two upstream providers burn retries and exponential backoff before the assertion — under load the bucket refilled and the test failed for reasons unrelated to what it checks. **Fixed in P0**: upstream now fails with 404 (NOT_FOUND returns from the decorator with no retry or backoff) and the drain happens inside BrasilAPI's call, microseconds before ViaCEP's limiter check. | `resilient-address-provider.integration.spec.ts` |

---

## 2. Pattern choice

**Decorator stays.** It is the correct structural home and the codebase already commits to it: raw provider →
resilient decorator (rate-limit, retry, error mapping) → resilient chain (`failureMode` routing). Nothing about
the timeout problem argues for replacing that structure.

What is missing is not a structural pattern but a **propagated capability**: a request-scoped
*deadline/budget* value object, in the spirit of Go's `context.Context`. Two supporting pieces complete it:

| Piece | Pattern | Role |
|---|---|---|
| `Deadline` | Value object / capability token | Immutable, self-shrinking budget. `derive()` can only narrow. |
| `runWithRetries` | Template method (one shared helper) | The single place attempt timeouts, backoff clamping and error classification live. Collapses D12. |
| Existing decorators | Decorator (unchanged) | Keep composing rate-limit + retry + mapping; now *consume* the helper instead of each hand-rolling it. |

Three abstractions total, one of them pre-existing. No container, no middleware pipeline, no new indirection layer.

---

## 3. `Deadline`

`src/core/shared/deadline.ts`, next to `result.ts` — framework-free, no Fastify/Redis/axios imports.

```ts
export class Deadline {
  static in(budgetMs: number, opts?: { linkedTo?: AbortSignal }): Deadline
  static none(): Deadline               // never expires — worker/CLI/absent-deadline callers

  readonly signal: AbortSignal
  readonly expiresAt: number            // epoch ms; Infinity for none()

  remainingMs(): number                 // max(0, expiresAt - now)
  get expired(): boolean
  derive(maxMs: number): Deadline       // expiresAt = min(parent.expiresAt, now + maxMs)
  dispose(): void                       // clearTimeout + removeEventListener (addresses Audit H-1)
  asError(): DeadlineExceededError
}
```

**The load-bearing invariant** is one line: `derive` takes a `min`, never a `max`. A child deadline can
therefore never outlive its parent, structurally rather than by convention — which is exactly the guarantee
requested, and a property-based test target (§7).

`derive` composes via `AbortSignal.any([parent.signal, ownController.signal])` with an owned timer, so
`dispose()` can actually release it. One timer per derived deadline; D2's duplicate racing timer disappears.

**Degenerate budgets are handled explicitly**, because Node fails silently here: it clamps any
`setTimeout` delay above 2³¹−1 ms — `Infinity` and `NaN` included — to **1 ms**, with only a
`TimeoutOverflowWarning` on stderr. Left unguarded, `Deadline.in(Infinity)` or a `NaN` from a
misparsed config value would abort on the next tick while `remainingMs()` still reported the full
budget, cancelling every request instantly. So a non-finite budget is treated as *unbounded* (still
honouring `linkedTo`), and the timer delay is clamped. `derive` sanitises its cap for the same
reason: `Math.min(finite, NaN)` is `NaN`, which would have produced an unbounded child of a bounded
parent — the one input able to break the class's own invariant.

### Guiding principles

1. **A deadline is inherited, never invented.** Any layer that needs a timeout calls `derive(itsConfiguredCap)`.
   No layer starts an independent clock.
2. **Leg caps are caps, not a sum.** The per-leg budgets below add up to more than the total on purpose. The
   `min()` against remaining budget is what enforces the total; a leg cap only bounds that leg when budget is
   plentiful. Sizing leg caps so they sum to the total would starve the happy path for no benefit.
3. **The deadline stops us starting or waiting on work — it never discards finished work.** If a fetch
   produced an answer, we return it and cache it, even if the clock ran out while it was landing (D11).

---

## 4. The timeout model

```
Route budget                    8s     HTTP_DEADLINE_POLICIES.churches.nearest   ← the only wall clock
  ├─ redis GET               derive(300ms)                                        (D3: now inside)
  ├─ fetch, on miss          detached Deadline.in(7.5s)                            (D4: see §5)
  │   ├─ address leg         derive(3s)
  │   │   └─ attempt         derive(min(provider TIMEOUT_MS, remaining))
  │   │        ├─ rate-limit derive(150ms)   ← consumed AFTER the expiry check     (D6/D7)
  │   │        └─ axios      { signal }      ← signal already caps it              (D5)
  │   ├─ geocode leg         derive(3s)
  │   ├─ KNN                 derive(1s) → SET LOCAL statement_timeout              (D10)
  │   └─ routing leg         derive(3.5s)
  └─ redis SET               own detached 300ms — bookkeeping, not the client's answer
```

**Raw providers keep `signal?: AbortSignal` unchanged.** They are thin axios adapters; a `Deadline` there
would be an abstraction with no consumer. The derived signal already fires at
`min(provider cap, remaining budget)`, and the static axios `timeout` stays as a socket-level backstop.
Five raw providers and their specs are untouched.

### Error semantics (D8)

| Condition | Error | `failureMode` | Chain behaviour | Negative-cached? |
|---|---|---|---|---|
| This attempt exceeded its own timeout, parent still has budget | `TimeoutExceededError` | `RETRYABLE` | advance to next provider | no |
| Parent budget exhausted / client gone | `DeadlineExceededError` **(new)** | `ABORTED` **(new)** | bail immediately | no |

`FailureMode` currently has no "terminal but not cacheable" quadrant: `RETRYABLE` advances the chain,
`NOT_FOUND`/`PERMANENT` are terminal *and* negative-cached. `ABORTED` fills it. Two consequences worth noting:

- The chains need **no new branch**. `ABORTED` falls through the existing default "unknown/fatal → bail
  immediately" path. Only the log message gets a dedicated case.
- `isRetryableChurchLookupError` already returns `true` (= don't cache) for anything that is not
  `NOT_FOUND`/`PERMANENT`, so a deadline expiry is never pinned to a CEP. No policy change.

`DeadlineExceededError` maps to `ErrorType.SERVICE_UNAVAILABLE` — the same HTTP 503 body as today.
**The public API contract does not change.**

Classification happens in one place: when an attempt's derived deadline fires, ask the parent —
`parent.expired ? DeadlineExceededError : TimeoutExceededError`.

---

## 5. Cache: dedup and boundaries

`pendingFetches` stores the shared fetch under a **detached** `Deadline.in(cacheFetchCap)`, owned by no caller.
Each waiter races the shared promise against **its own** deadline:

- Caller A disconnecting can no longer cancel caller B (**D4**).
- Caller B cannot be charged caller A's remaining budget.
- If every waiter leaves, the fetch still completes and populates the cache — desirable warming, bounded by
  the cap and by `MAX_PENDING`.

`redis.get` moves inside the budget (**D3**). `redis.set` keeps a small *detached* budget: the answer is
already computed and paid for, and the write is bookkeeping rather than part of the client's response
(**D11**, principle 3). This is the one deliberate exception to strict nesting and is documented as such in
the code.

`buildEffectiveSignal` and `createTimeoutRace` are deleted (**D2**).

---

## 6. Migration strategy

Six phases. `deadline?` is optional at every boundary throughout, defaulting to `Deadline.none()` — so each
phase is independently green and behaviour-neutral until P3.

| Phase | Content | Behaviour change |
|---|---|---|
| **P0** ✅ | `Deadline`, `DeadlineExceededError`, `FailureMode.ABORTED`, registry entry. Unit + property tests. No wiring. Plus D13/D14/D15 pulled forward. | none |
| **P1** ✅ | `runWithRetries` + `sleepUntil` + `checkAdmission` helpers; the three decorators refactored onto them. Routing gains the retry loop (docs §4.3). Provider interfaces migrated `signal?` → `deadline?`; `Deadline.linkedTo` bridges the cache's signal until P2. | rate-limit ordering (D6); routing retries; D8 classification; D9 removed |
| **P2** ✅ | `ResilientCache`: single deadline, detached shared fetch, per-waiter race, budget-inclusive Redis ops, keep-the-result rule. `buildEffectiveSignal` and `createTimeoutRace` deleted. | D2, D3, D4, D11, D17 |
| **P3** ✅ | `deadline.plugin.ts` + `HTTP_DEADLINE_POLICIES` + route opt-in + controller wiring; client-disconnect linkage; **15s → 8s route budget, 7.5s cache cap**. | client-visible latency ceiling; disconnect cancels |
| **P4** ✅ | KNN `SET LOCAL statement_timeout` derived from the deadline, applied only when a ceiling is asked for. Plus **D19**. | D10, D19 |
| **P5** ✅ | Dead code removed as each phase landed — `buildEffectiveSignal`, `createTimeoutRace`, `TimeoutRace`, `abortedError`, the three hand-rolled `sleep` helpers and the never-firing `AbortController` placeholders are all gone, verified by search rather than assumed. Final sweep additionally removed the cache's invented **12s default** fetch cap (**D21**), leaving `knip` clean and no stale references outside deliberate history comments. | none |

### Behaviour changes, with justification

1. **15s → 8s** — prescribed by architecture-assessment §4.2; a client-facing GET should not hold a
   connection for 15s. Happy path is two external calls (~5s worst case), so 8s still completes it.
2. **Rate-limit consumed after the expiry check** — an already-dead request burning 1 of ViaCEP's 1 pt/s is
   pure waste that penalises live requests.
3. **Routing decorator retries** — docs defect 3; a single transient blip currently fails the whole request.
   Does not conflict with the recorded "routing fails hard" decision: it recovers blips, it does not fall back.
4. **Client disconnect aborts** — frees sockets, Redis slots and provider quota. Trade-off accepted: the
   in-flight result is still cached (principle 3), so the work is not wasted.
5. **Post-expiry successful results returned and cached** — see principle 3.
6. **Chains bail on `ABORTED`** — currently they walk every remaining provider on an expired budget, each
   returning instantly with the same error.

### Interface changes (all internal; no HTTP contract change)

```
IAddressProvider.fetchAddress(cep, deadline?)
IGeocodingProvider.search(query, deadline?) / searchStructured(options, deadline?)
IChurchRoutingProvider.getDistances({ ..., deadline? })
FindNearestChurchesUseCase.execute({ cep, deadline? })
CepToLatLonUseCase.execute({ cep, deadline? })
CalculateChurchRouteDistancesUseCase.findNearest({ churches, user, deadline? }, profile)
FindNearbyChurchesKnnUseCase.execute({ userLat, userLon, deadline? })
ChurchesRepository.findNearest({ ..., timeoutMs? })      // plain ms — keeps core contracts framework-free
ResilientCache.getOrFetch(key, fetcher: (d: Deadline) => ..., parentDeadline?)
IRaw*Provider.*                                          // UNCHANGED
```

The `signal?: AbortSignal` parameter is replaced rather than supplemented, per the interview decision — one
way to express cancellation, not two. Cost: roughly ten spec files pass an `AbortSignal` positionally today
and must be updated (decorator specs are 58/58/165 lines; chain specs 226/266).

---

## 7. Test plan (CLAUDE.md gauntlet)

**Layer 3 — property (`fast-check`), on `Deadline`:** for any parent budget and any child budget,
`derived.expiresAt <= parent.expiresAt`; `remainingMs() >= 0` always; repeated `derive` is monotonically
non-increasing. This is the machine-checked form of "a child cannot outlive its parent".

**Layer 2 — unit**, per decorator and chain:
- cancellation **before** the call (nothing is attempted, `tryConsume` **not** called — asserted directly)
- cancellation **during** the call (in-flight axios aborts; backoff sleep exits early)
- cancellation **after** the call (result is kept and cached, not discarded)
- attempt skipped when remaining budget is below the floor
- backoff clamped so it never sleeps past the deadline
- `DeadlineExceededError` vs `TimeoutExceededError` classification at the boundary
- chain bails on `ABORTED` without touching the next provider

**Nested-budget tests** with fake timers (no `sleep` — CLAUDE.md forbids it): assert every leg's `expiresAt`
is `<=` the route deadline's, across the full 8s → legs → attempts ladder.

**Regression tests** (must fail on pre-fix code, named for the symptom):
- `shared-fetch-cancellation-bleed.regression.spec.ts` — waiter A aborts, waiter B still resolves (D4)
- `result-discarded-at-deadline.regression.spec.ts` — a result landing just before expiry is returned and
  cached (D11)
- `rate-limit-consumed-after-abort.regression.spec.ts` — expired request consumes no provider quota (D6)

**Layer 1 — acceptance:** a Gherkin scenario for budget exhaustion → 503 with the unchanged body.

**Layer 4/5:** `npx eslint --max-warnings 0` on every changed file; `npm run test:mutation` on the changed
globs (`src/core/shared/deadline.ts`, `src/providers/helpers/**`, the three decorators, `resilient-cache.ts`),
killing survivors — boundary operators in `derive`'s `min` and the skip-floor comparison are the obvious
mutation targets.

**Existing suites** that must stay green: `unit-resilient-cache`, `unit-churches`, `unit-geo-provider`,
`unit-address-provider`, `unit-church-routing-provider`, `acceptance`, `e2e`.
