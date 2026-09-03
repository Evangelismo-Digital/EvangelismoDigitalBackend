# Unit-test coverage expansion + mutation-testing report

_Generated 2026-09-02. Layer 2 (unit) + Layer 5 (mutation) of the Agent Quality & Mutation Testing Gauntlet._

## 1. What changed

Added colocated unit specs for every **logic-bearing module** under `src/` that had
no direct test, then ran the Stryker mutation gauntlet and closed every killable
survivor in the new coverage.

| | Before | After |
|---|---|---|
| `npm run test:unit:all` — spec files run¹ | 80 | 111 |
| `npm run test:unit:all` — tests | 696 | 974 |
| New spec files added / removed | — | +26 / −1² |
| Mutation score, **new-coverage files** (548 valid mutants) | ~48 % | **96.72 %** |
| Mutation score, full `src/**` (4 616 valid mutants, report only) | 53.01 % | 53.88 % |

¹ Counted per vitest project, so files in overlapping project `dir`s
(`unit-use-cases` ∩ `unit-churches`, …) are counted more than once.
² `redis-rate-limiter.spec.ts` was drafted then removed — the module is already
covered by `rate-limiter.spec.ts`.

The full-tree number is a **report, not a gate** (per `stryker.conf.mjs`): it is
dominated by ~1 300 `NoCoverage` mutants in files that are out of unit scope by
`CLAUDE.md` (HTTP controllers, routes, Fastify plugins, Prisma repositories,
`app.ts`, `metrics-server.ts`, `src/load-test/**`, the `make*` factories) — those
are exercised by the e2e / acceptance / integration layers instead.

### New vitest projects

`src/core/**` and `src/providers/helpers/**` were not matched by any existing
vitest project. Two projects were added and registered in lockstep:

- `vite.config.mts` — `unit-core`, `unit-providers-helpers`; `unit-http` `include`
  widened to also collect `presenters/**` and `middlewares/**` specs.
- `package.json` `test:unit:all`, `.github/workflows/ci.yml`, `scripts/ci-local.sh`
  — added `--project=unit-core --project=unit-providers-helpers`.

`vitest.stryker.config.mts` needed no change — it globs `src/**/*.spec.ts`.

## 2. New unit specs and their mutation score

| File under test | Spec | Mutants | Score |
|---|---|---|---|
| `core/shared/result.ts` | `result.spec.ts` (fast-check) | 9 | 100 % |
| `providers/helpers/precision-helper.ts` | `precision-helper.spec.ts` (fast-check) | 65 | 96.9 % † |
| `use-cases/users/helpers/token-hash.ts` | `token-hash.spec.ts` (fast-check) | 3 | 100 % |
| `use-cases/churches/calculate-church-route-distances-use-case.ts` | `…​.spec.ts` | 41 | 100 % |
| `use-cases/churches/find-nearby-churches-knn-use-case.ts` | `…​.spec.ts` | 28 | 100 % |
| `use-cases/decorators/transactional-use-case.decorator.ts` | `…​.spec.ts` | 14 | 100 % |
| `use-cases/outbox-event/outbox-event-use-case.ts` | `…​.spec.ts` | 2 | 100 % |
| `use-cases/forms/strategies/contact-email-strategy.ts` | `…​.spec.ts` | 49 | 100 % |
| `use-cases/forms/strategies/decision-for-christ-email-strategy.ts` | `…​.spec.ts` | 52 | 100 % |
| `providers/geo-provider/location-iq-provider.ts` | `…​.spec.ts` | 21 | 100 % |
| `providers/geo-provider/nominatim-provider.ts` | `…​.spec.ts` | 36 | 100 % |
| `providers/address-provider/awesome-api-provider.ts` | `…​.spec.ts` | 19 | 100 % |
| `providers/address-provider/brasil-api-provider.ts` | `…​.spec.ts` | 25 | 100 % |
| `providers/address-provider/viaCep-provider.ts` | `…​.spec.ts` | 17 | 100 % |
| `providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator.ts` | `…​.spec.ts` | 23 | 100 % |
| `http/presenters/church-presenter.ts` | `church-presenter.spec.ts` | 12 | 100 % |
| `http/presenters/user-presenter.ts` | `user-presenter.spec.ts` | 6 | 100 % |
| `http/middlewares/verify-jwt.middleware.ts` | `…​.spec.ts` | 4 | 100 % |
| `http/middlewares/verify-user-role.middleware.ts` | `…​.spec.ts` | 12 | 100 % |
| `errors/http-errors/http-error-mapper.ts` | `…​.spec.ts` | 8 | 100 % |
| `errors/http-errors/http-error-status.mapper.ts` | `…​.spec.ts` | 3 | 100 % |
| `errors/http-errors/zod-validation-error.ts` | `…​.spec.ts` | 2 | 100 % |
| `errors/app-error-registry.ts` | `app-error-registry.spec.ts` | 67 | 76.1 % † |
| `lib/prisma/utils/prisma-error-mapper.ts` | `prisma-error-mapper.spec.ts` | 10 | 100 % |
| `lib/infra/jobs/make-outbox-dispatch-registry.ts` | `make-outbox-dispatch-registry.spec.ts` | 4 | 100 % |
| `repositories/prisma/errors/{users,churches,forms,outbox}-error-mapping.ts` | `error-mappings.spec.ts` | 16 | 100 % |

† = remaining survivors are all **equivalent mutants** — see §4.

`src/lib/infra/rate-limiter/redis-rate-limiter.ts` was initially flagged as
untested; it is in fact fully covered by the pre-existing
`src/lib/infra/rate-limiter/rate-limiter.spec.ts` (name mismatch), so no new spec
was added and a draft duplicate was removed.

## 3. Survivors that were killed (remediation)

The first full run left 39 survivors across the new-coverage files. All
genuinely-killable ones were closed by tightening assertions:

| File | Survivor(s) | Fix |
|---|---|---|
| `contact-email-strategy.ts` / `decision-for-christ-email-strategy.ts` | `'form.name'` / early-return `ConditionalExpression` in `buildStaffEmail`; `typeof form.ipAddress === 'string'` ternary; `(value as string) \|\| ''` in `getOptionalStringField` | Added: bad-email/bad-name cases for `buildStaffEmail`; a **numeric `ipAddress`** case asserting the value never reaches the rendered body; "absent optional field ≡ empty-string field" deep-equality plus `not.toContain('Stryker'/'undefined')`; assert `lastName`/`location` reach the HTML. |
| `nominatim-provider.ts` | `searchRaw` params `ObjectLiteral`; `'/search'` `StringLiteral`; `cleanParams` `value !== null` `ConditionalExpression` | Assert `searchRaw` calls `get('/search', { params: { q, format } })`; add a `null`-valued param and assert it is stripped while non-filtered params survive. |
| `location-iq` / `nominatim` / `awesome-api` / `brasil-api` / `viaCep` providers | constructor config `ObjectLiteral` mutants (`createHttpClient({…})`, `headers`, `agentOptions`, `params`) | Added a "wires the HTTP client" test per provider asserting `createHttpClient` is called with `baseURL`, a numeric `timeout`, `agentOptions.maxSockets`, and the auth-token `params` / `User-Agent` header. |
| `resilient-church-routing-provider.decorator.ts` | `'routing'` `StringLiteral` on the aborted-signal path; `endTimer?.()` `OptionalChaining` in `catch` | Assert `recordProviderRequest('routing', …)` on the aborted path; add two tests with `collectMetricsProviderLatency.startTimer` returning `undefined` so the optional call is exercised on both success and failure paths. |
| `app-error-registry.ts` | `InvalidCepError` `/\b\d{8}\b/ \|\| /\d{8}/` fallback + `?.[0]`; `CepToLatLonError` `/\d+/ \|\| ''`; `ServiceBusyError` `data?.body?.provider` optional chaining; `serializeAppError` `.data \|\| err` | Added: 8 digits embedded in text (word-boundary regex fails, fallback matches); a stray single digit next to an 8-digit run (proves the `{8}` quantifier); message with no digits (empty/undefined CEP branch); `data` present but `body` absent (optional-chaining safety); `serializeAppError` on an error that carries an explicit `.data` vs one that does not. |

Re-run after remediation: new-coverage aggregate **96.72 %** (530 / 548 valid
mutants killed).

## 4. Equivalent mutants (documented, not killable)

18 survivors remain in the new-coverage set. Every one is an **equivalent
mutant** — the mutated program is observably identical to the original at the
module's public boundary, so no honest test can distinguish them. They are **not**
suppressed with inline `// Stryker disable` comments: both `precision-helper.ts`
and `app-error-registry.ts` carry pre-existing Layer 4 `complexity` warnings
(`fromOsm` = 10, `ProviderFailureError` factory = 16) that the `PostToolUse` hook
turns into a hard failure the moment either file is edited, and refactoring
production control flow is out of scope for a test-coverage task. They are
catalogued here instead.

### `src/providers/helpers/precision-helper.ts` — 2 equivalents

| Line | Mutator | Mutation | Why equivalent |
|---|---|---|---|
| 18 | StringLiteral | `data.type \|\| ''` → `data.type \|\| "Stryker was here!"` | `type` is used **only** as `[...].includes(type)`. For any input where `data.type` is falsy, both `''` and `"Stryker was here!"` are non-members of the lists, so `includes` returns `false` either way. The value is never returned, compared for content, or logged. |
| 19 | StringLiteral | `data.class \|\| ''` → `data.class \|\| "Stryker was here!"` | Identical reasoning for `category` / `[...].includes(category)`. |

### `src/errors/app-error-registry.ts` — 16 equivalents

**Lines 52–53 (15 mutants).** The `ProviderFailureError` factory resolves a
`provider` string and a `layer` from
`data?.body?.providerContext?.… || data?.providerContext?.… || <default>` and
passes them to `new ProviderFailureError(provider, layer, …)`.
`ProviderFailureError` forwards `providerContext: { provider, layer }` into its
`IErrorDetail`, but `AppError`'s constructor copies **only** `code`, `message` and
`issues` onto `error.body`; `providerContext` is dropped and never appears on the
message, the body, or any public getter. Consequently every operand the mutated
`||` / `?.` chain can select — `'LocationIQ'`, `undefined`, `'Unknown'`,
`ProviderLayer.Address`, `''` — produces a `ProviderFailureError` that is
byte-for-byte identical through `error.name`, `error.message`, `error.body`,
`error.type`, `error.failureMode` and `error.telemetryReason`. The two positive
tests we keep (`providerContext` at top level, and nested under `body`) pin the
`instanceof` and `failureMode`; the remaining `ConditionalExpression` /
`LogicalOperator` / `OptionalChaining` / `StringLiteral` mutants on these two
lines cannot be killed without either (a) changing production code to surface
`providerContext`, or (b) asserting on private state — both rejected.

Affected mutants: `L52 ConditionalExpression×3`, `L52 LogicalOperator×2`,
`L52 OptionalChaining×2`, `L52 StringLiteral×1` (`'Unknown'`→`''`),
`L53 ConditionalExpression×3`, `L53 LogicalOperator×2`, `L53 OptionalChaining×2`.

**Line 77 (1 mutant).** `deserializeAppError`: `if (factory) { … }` →
`if (true) { … }`. When `type` is unregistered, `factory` is `undefined`; the
mutant then evaluates `factory(message, …)` → `undefined(...)` → `TypeError`,
which is caught by the surrounding `try/catch` and falls through to
`return new UnknownDeserializationError(message)` — the exact value the original
`if (factory)` false-branch returns. Observably identical.

## 5. Out-of-unit-scope files (context for the 53.88 % full-tree number)

Largest `NoCoverage` contributors, all intentionally excluded from the unit layer
per `CLAUDE.md` (“HTTP controllers → e2e”, “repositories/providers/adapters get a
Layer 4 integration test”, factories are trivial wiring):

`stadia-church-routing-provider.ts` (93 — has an e2e/spec that Stryker's `perTest`
analysis under-attributes), `src/load-test/**` (77), `prisma-users-repository.ts`
(74), `analytics.plugin.ts` (64), `metrics-server.ts` (59), `app.ts` (51),
`users.routes.ts` (49), `track-event.controller.ts` (41),
`prisma-churches-repository.ts` (35), `prisma-analytics-repository.ts` (31),
`request-lifecycle.plugin.ts` (25), the HTTP controllers, the `make*` factories,
`https-agent.ts`, `mail-queue.ts`, `redis/**` connection singletons.

## 6. Reproduce

```bash
# Layer 2 — unit
npm run test:unit:all            # 974 tests, 106 files

# Layer 5 — full report (5 min, exits 1 on the 85 % break threshold by design)
npm run test:mutation
open reports/mutation/index.html

# Layer 5 — scoped gate on the new-coverage files (must be ≥ 85 %)
npx stryker run --incremental --mutate "src/use-cases/forms/strategies/*.ts,src/providers/geo-provider/*-provider.ts,src/providers/address-provider/*-provider.ts,src/providers/church-routing-provider/decorators/*.ts,src/errors/app-error-registry.ts,src/errors/http-errors/*.ts,src/lib/prisma/utils/prisma-error-mapper.ts,src/repositories/prisma/errors/*.ts,src/use-cases/churches/calculate-church-route-distances-use-case.ts,src/use-cases/churches/find-nearby-churches-knn-use-case.ts,src/use-cases/decorators/transactional-use-case.decorator.ts,src/use-cases/outbox-event/outbox-event-use-case.ts,src/use-cases/users/helpers/token-hash.ts,src/http/presenters/*.ts,src/http/middlewares/*.ts,src/core/shared/result.ts,src/providers/helpers/precision-helper.ts"
```
