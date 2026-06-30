# 🔍 Comprehensive Code Audit Report — `src/`

**Project**: EvangelismoDigitalBackend  
**Date**: 2026-06-30  
**Scope**: All production source files (excluding `.spec.ts` tests)  
**Severity Filter**: Medium-to-Critical only  

---

## Summary of Findings

| Severity | Count |
|----------|-------|
| 🔴 Critical | 3 |
| 🟠 High | 7 |
| 🟡 Medium | 10 |
| **Total** | **20** |

---

## 🔴 CRITICAL — Production incident risk

### C-1: Email Strategies throw raw `Error` — breaks Result Pattern inside Outbox pipeline

**Files**:
- [contact-email-strategy.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/forms/strategies/contact-email-strategy.ts#L40-L52)
- [decision-for-christ-email-strategy.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/forms/strategies/decision-for-christ-email-strategy.ts#L41-L53)

**Category**: Result Pattern Violation  
**Description**: Both `ContactEmailStrategy` and `DecisionForChristEmailStrategy` throw raw `Error` objects in `getStringField()` and `getOptionalStringField()` methods. These strategies are called inside `OutboxProcessor.dispatchToBullMQ()`, which does **not** wrap them in a `try/catch`. The thrown exception will propagate up through `processSingleEvent()` into its `catch` block, which will attempt to revert the event to `PENDING`. However, the error is a generic `Error`, not an `AppError`, so any downstream logging or mapping that expects `AppError` properties will fail silently or produce unhelpful diagnostics.

**Impact**: If the outbox payload ever contains a non-string field (e.g., `null` due to a DB migration bug), the entire outbox pipeline will enter a poison-pill loop — the event repeatedly transitions PENDING → SENDING → throws → back to PENDING, forever consuming resources with no useful error message.

**Remediation**: Replace throws with Result Pattern returns, or catch these errors at the `dispatchToBullMQ` call site with proper `AppError` wrapping.

---

### C-2: `ViaCepProvider.fetchRawAddress` throws `InvalidCepError` — inconsistent with `IRawAddressProvider` contract

**File**: [viaCep-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/address-provider/viaCep-provider.ts#L69)

**Category**: Result Pattern Violation / Contract Inconsistency  
**Description**: `ViaCepProvider.fetchRawAddress()` throws `new InvalidCepError(cleanCep)` when the ViaCEP API returns `erro: true`. However, the other raw providers (`AwesomeApiProvider`, `BrasilApiProvider`) return `null` for the same scenario. The `IRawAddressProvider` interface declares the return type as `Promise<IAddressData | null>` — returning `null` signals "not found" cleanly.

The `ResilientAddressProviderDecorator` does `catch` this throw and maps it via `FindNearestChurchesErrorMapper.map()`, which converts `InvalidCepError` (an `AppError`) back to itself. So the immediate behavior is correct **by accident**. But this creates a hidden coupling: if anyone uses `ViaCepProvider` without the decorator, it will throw unexpectedly. More importantly, it means `ViaCepProvider` behaves differently from the other providers — breaking the Liskov Substitution Principle.

**Impact**: Maintenance risk and potential regression. If the decorator is refactored or bypassed, the throw becomes an unhandled exception.

**Remediation**: Change ViaCepProvider to `return null` instead of throwing, matching the contract of the other providers.

---

### C-3: `OutboxProcessor.processSingleEvent` throws inside a Result-aware chain

**File**: [outbox-processor.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/jobs/outbox-processor.ts#L99)

**Category**: Result Pattern Violation  
**Description**: At line 99, `processSingleEvent` uses `throw updateResult.error` to signal that the status update to `SENDING` failed. This mixes throw-based control flow with the Result Pattern. The method is called from both `processEvents()` (which catches at L51) and from `OutboxSignal.subscribe()` in `worker.ts` — where **there is no explicit catch**. If `processSingleEvent` throws, the error is caught only by the `try/catch` in the `OutboxSignal.subscribe` message handler, which logs and swallows it. This means the event will remain in `PENDING` silently (not reverted as intended by the catch at L102-L113).

**Impact**: Status update failures in the pub/sub path cause silent event stalls — the event is never retried because the error is swallowed upstream.

**Remediation**: Convert `processSingleEvent` to fully return Result, and handle the `updateStatus` error without throwing.

---

## 🟠 HIGH — Architectural concern or latent bug

### H-1: `ResilientCache.pendingFetches` Map can leak under abnormal conditions

**File**: [resilient-cache.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/cache/resilient-cache.ts#L35)

**Category**: Potential Memory Leak  
**Description**: The `pendingFetches` Map uses `key → Promise` entries that are cleaned up in a `finally` block (L136). However, if `executeFetchWithSignalLogic` itself throws synchronously before the returned promise is stored (unlikely but possible with V8 runtime errors like stack overflow), the key will remain in the Map permanently. More realistically, the `AbortSignal.any()` call at line 152 creates composite abort signals with internal listeners. These listeners reference the closures in `executeFetchWithSignalLogic`. Each call creates a new composite signal, and if the GC can't collect the parent signals promptly, these closures accumulate.

Additionally, the `MAX_PENDING` guard at L68 returns an error without any backpressure mechanism — under sustained load, every single request pays the cost of the Map size check but gets nothing useful in return.

**Impact**: Under sustained high load with many concurrent CEP lookups, memory could grow steadily.

**Remediation**: Consider adding a TTL-based cleanup sweep for the `pendingFetches` Map (e.g., a periodic `setInterval` that removes entries older than `FETCH_TIMEOUT * 2`). Also consider using `WeakRef` or a bounded LRU for the dedup map.

---

### H-2: `app.ts` `setInterval` for memory monitoring is never cleared

**File**: [app.ts](file:///home/amaro/EvangelismoDigitalBackend/src/app.ts#L38-L53)

**Category**: Potential Memory Leak / Resource Leak  
**Description**: The `setInterval` at line 38 runs every 60 seconds in production but the interval handle is never stored and never cleared in the `onClose` hook. When running integration tests that create and destroy the Fastify app, this interval leaks and prevents the Node.js process from exiting cleanly.

**Impact**: Test hangs, leaked timers in test environments. Minor in production since the process lifecycle matches the interval lifetime.

**Remediation**: Store the interval reference and call `clearInterval()` in the `onClose` hook.

---

### H-3: `RegisterUserUseCase` makes 3 sequential DB queries for uniqueness checks — N+1 and race condition

**File**: [register-user.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/users/register-user.ts#L34-L62)

**Category**: Logic Error / Performance  
**Description**: The registration flow queries `findBy({email})`, `findBy({cpf})`, and `findBy({username})` sequentially. This causes three separate DB round-trips. More critically, this is a **TOCTOU (Time-Of-Check/Time-Of-Use) race condition**: another request could register the same email/cpf/username between the uniqueness check and the `create()` call. Since there's no DB-level transaction wrapping these checks + the create, two concurrent registrations with the same email could both pass the uniqueness check and both succeed.

The Prisma error mapper **does** catch the `P2002` unique constraint violation, so the DB will reject the duplicate — but the error may not map cleanly to `UserAlreadyExistsError` depending on the mapper configuration.

**Impact**: Under concurrent registration load, a duplicate user error might surface as a generic database error instead of a clean `UserAlreadyExistsError`. Three sequential queries also add unnecessary latency (~3x).

**Remediation**: Rely primarily on the DB unique constraint and catch the `P2002` error, mapping it to `UserAlreadyExistsError`. Consider wrapping the checks in a transaction or using a single query with `OR` conditions.

---

### H-4: `UpdateUserUseCase` empty string fields are falsy — updating name/email/username to empty string is silently ignored

**File**: [update-user.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/users/update-user.ts#L42-L44)

**Category**: Logic Error  
**Description**: Lines 42-44 use truthy checks: `if (name) data.name = name`. An empty string `""` is falsy in JavaScript, so if a user intentionally passes `name: ""` (or `username: ""`), the field will not be included in the update. While the Zod schema likely prevents this, it's a defense-in-depth issue — the use case should be correct independently of the controller's validation.

**Impact**: If validation ever allows empty strings (e.g., a future schema change), the update silently does nothing for that field.

**Remediation**: Use explicit `undefined` checks: `if (name !== undefined) data.name = name`.

---

### H-5: `FormsSubmissionUseCase` uses `instanceof` to distinguish error types — fragile error routing

**File**: [forms-submission.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/forms/forms-submission.ts#L27-L33)

**Category**: Design Pattern Violation (Open/Closed Principle)  
**Description**: The logic at L27-33 is:
```typescript
if (isOk(findEmailResult)) {
  return err(new FormsAlreadyExistsError())
}
if (!(findEmailResult.error instanceof FormsNotFoundError)) {
  return findEmailResult
}
```
This uses `instanceof` to branch on error type, which contradicts the project's own design principle (documented in `AppError`: "callers never need `instanceof` to branch on it"). The correct approach would be to use `failureMode` or the error's `body.code` for routing.

Additionally, the logic is **inverted from expectations**: `findByEmail` returns `err(FormsNotFoundError)` when the email doesn't exist, but this is actually the *happy path* for a new submission. This makes `isOk` mean "email already taken" — which is semantically confusing.

**Impact**: Maintenance confusion and fragile coupling. Adding a new error type to the repository would require updating this instanceof check.

**Remediation**: Redesign `findByEmail` to return `ok(null)` when no submission exists (matching the pattern used in `UsersRepository.findBy`), or use `failureMode` / `error.body.code` for branching.

---

### H-6: `searchUsersController` does not use Zod schema — raw query parsing with manual validation

**File**: [search-users.controller.ts](file:///home/amaro/EvangelismoDigitalBackend/src/http/controllers/users/search-users.controller.ts#L8-L16)

**Category**: Architectural Inconsistency / Security  
**Description**: Every other controller uses Zod schemas (e.g., `authenticateSchema.parse(request.body)`) for input validation. The search controller casts `request.query` directly with `as { query: string; page: string }` and does manual `parseInt` + `isNaN` validation. This bypasses Zod's type coercion, sanitization, and error formatting. The user also gets a non-standard error format (no `code` field, no Zod issues).

**Impact**: Inconsistent error responses for invalid input. Potential for injection if `query` contains unexpected characters (though Prisma parameterizes queries, so SQL injection is not a direct risk).

**Remediation**: Create a Zod schema for search query parameters and use `.parse()` like every other controller.

---

### H-7: `reset-password.controller.ts` logs the internal database `user.id` — potential information leak

**File**: [reset-password.controller.ts](file:///home/amaro/EvangelismoDigitalBackend/src/http/controllers/users/reset-password.controller.ts#L21)

**Category**: Security  
**Description**: Line 21 logs `userId: user.id` (the internal autoincrement primary key) instead of `user.publicId`. Other controllers correctly log `publicId`. The internal `id` is sequential and reveals the total number of users, registration ordering, and database structure.

**Impact**: Information leakage through logs. If logs are ingested into a monitoring system accessible to non-admin users, this exposes internal DB identifiers.

**Remediation**: Change to `userId: user.publicId`.

---

## 🟡 MEDIUM — Technical debt or maintainability concern

### M-1: `CepToLatLonUseCase` stores a `redis` instance it never uses directly

**File**: [cep-to-lat-lon-use-case.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/churches/cep-to-lat-lon-use-case.ts#L30-L40)

**Category**: Dead Code / SRP Violation  
**Description**: The class stores `this.redis = redis` at line 40, but the only use of `this.redis` is at line 64: `await this.redis.del(cacheKey)` — for the `cacheSuccessResults = false` path. This means the use case holds a direct Redis dependency in addition to the `ResilientCache` instance. This breaks the Dependency Inversion principle — the use case now has two separate paths to Redis.

**Remediation**: Add a `delete(key)` method to `ResilientCache` and route through it, or inject a simpler `CacheInvalidator` interface.

---

### M-2: `ResilientAddressProvider` and `ResilientGeoProvider` constructors throw exceptions

**Files**:
- [resilient-address-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/address-provider/resilient-address-provider.ts#L22-L24)
- [resilient-geo-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/geo-provider/resilient-geo-provider.ts#L25-L28)

**Category**: Result Pattern Violation (constructor)  
**Description**: Both constructors throw `NoAddressProviderError()` / `NoGeoProviderError()` if the providers array is empty. While constructor throws are more acceptable than business-flow throws (this is a configuration error, not a runtime decision), it still means these classes are not fully "exception-free" as the architecture aspires to be.

**Remediation**: This is acceptable for configuration-time validation. Consider documenting this as a deliberate exception to the Result Pattern rule (fail-fast during wiring, not during request processing).

---

### M-3: `RedisRateLimiter.getLimiter()` throws `NoRateLimiterSetError` — hidden throw in hot path

**File**: [redis-rate-limiter.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/rate-limiter/redis-rate-limiter.ts#L128-L131)

**Category**: Result Pattern Violation  
**Description**: `getLimiter()` throws if the `provider` enum value doesn't exist in `providerConfigs`. This is called from `tryConsume()`, which has a `catch` block that returns `true` (fail-open). So the throw is caught — but it's caught in a generic catch that can't distinguish "misconfigured provider" from "Redis is down". Both cases silently allow the request through.

**Remediation**: Since `EnumProviderConfig` is a TypeScript enum and the config map covers all values, this throw is essentially unreachable. Adding an exhaustiveness check at compile time (`satisfies Record<EnumProviderConfig, ...>`) would be cleaner.

---

### M-4: `closeAllRedisConnections` doesn't handle already-closed connections

**File**: [clients.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/redis/clients/clients.ts#L37-L47)

**Category**: Potential Bug  
**Description**: `closeAllRedisConnections` calls `.quit()` on all non-null connections without checking their current status. If a connection is already in `end` or `close` state, `.quit()` may throw or hang. The `OutboxSignal.disconnect()` correctly checks `client.status !== 'end'` before calling `.quit()`, but `closeAllRedisConnections` does not.

**Remediation**: Add a status check before calling `.quit()`, matching the pattern in `OutboxSignal.disconnect()`.

---

### M-5: `FindNearestChurchesUseCase` constructor manually copies every option field from `optionsOverride`

**Files**: 
- [find-nearest-churches-use-case.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/churches/find-nearest-churches-use-case.ts#L34-L44)
- [cep-to-lat-lon-use-case.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/churches/cep-to-lat-lon-use-case.ts#L42-L52)

**Category**: Code Duplication (DRY violation)  
**Description**: Both constructors manually destructure every field from `optionsOverride` into a new object to pass to `ResilientCache`. This is repeated verbatim in both classes. If a new option is added to `ResilientCacheOptions`, two constructors need to be updated.

**Remediation**: Pass `optionsOverride` directly to `new ResilientCache(redis, optionsOverride)` since the shape is identical. Or create a factory function.

---

### M-6: `ResilientChurchRoutingProviderDecorator` uses `!fetchResult.success` instead of `isErr()`

**File**: [resilient-church-routing-provider.decorator.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator.ts#L52)

**Category**: Inconsistency  
**Description**: Line 52 uses `if (!fetchResult.success)` while every other file in the codebase uses the type-guard `isErr(fetchResult)`. This is functionally identical but breaks the consistency that makes the codebase easy to audit and grep.

**Remediation**: Replace with `if (isErr(fetchResult))`.

---

### M-7: `ListUsersUseCase` and `SearchUsersUseCase` return `UserNotFoundError` for empty results — semantic mismatch

**Files**:
- [list-users.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/users/list-users.ts#L23-L25)
- [search-users-use-case.ts](file:///home/amaro/EvangelismoDigitalBackend/src/use-cases/users/search-users-use-case.ts#L28-L29)

**Category**: Domain Modeling  
**Description**: Both use cases return `UserNotFoundError()` when the result list is empty. But an empty list is not an error — it's a valid response. `UserNotFoundError` is semantically designed for "a specific user identified by ID/publicId does not exist" (HTTP 404). An empty search result should be an `ok({ users: [] })`, leaving it to the controller to decide the HTTP response code.

**Impact**: The client receives a 404 error when searching for users that don't match, instead of an empty array with 200. This makes the API confusing for frontend developers.

**Remediation**: Return `ok({ users: [] })` for empty collections. Reserve `UserNotFoundError` for single-entity lookups.

---

### M-8: Provider classes use `static` Axios instances — stale configuration risk

**Files**:
- [viaCep-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/address-provider/viaCep-provider.ts#L29)
- [awesome-api-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/address-provider/awesome-api-provider.ts#L28)
- [brasil-api-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/address-provider/brasil-api-provider.ts#L22)
- [nominatim-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/geo-provider/nominatim-provider.ts#L15)
- [location-iq-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/geo-provider/location-iq-provider.ts#L22)
- [stadia-church-routing-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/church-routing-provider/stadia-church-routing-provider.ts#L31)

**Category**: Design Pattern / Testability  
**Description**: Every provider uses a `private static api: AxiosInstance` pattern with a `if (!ProviderClass.api)` guard in the constructor. This has two problems:
1. **First-caller wins**: The first instance's config is used forever. If two tests create the same provider with different configs, the second one silently uses the first one's config.
2. **No cleanup**: The static instance persists across the entire process lifetime, including across tests. There's no way to reset or replace it.

This isn't currently a production bug, but it makes unit testing fragile and prevents configuration changes at runtime.

**Remediation**: Use instance-level Axios clients (remove the `static` keyword), or provide a static `resetClient()` method for testing, or inject the Axios instance via the constructor.

---

### M-9: `mail-queue.ts` instantiates at module import time — side effect import

**File**: [mail-queue.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/queue/mail-queue.ts#L8-L23)

**Category**: Architecture / Testability  
**Description**: Lines 8-23 create a Redis connection and instantiate a BullMQ Queue at module load time (top-level). Any file that imports from `mail-queue.ts` will immediately create a Redis connection, even if it's just importing the type. This causes side effects during test imports and makes it impossible to mock the queue without intercepting the module system.

**Remediation**: Wrap in a lazy factory function (similar to `getRedisCache()`).

---

### M-10: `forgotPassword` controller bypasses the Outbox Pattern — sends email directly

**File**: [forgot-password.controller.ts](file:///home/amaro/EvangelismoDigitalBackend/src/http/controllers/users/forgot-password.controller.ts#L33-L46)

**Category**: Architectural Violation  
**Description**: The `forgotPassword` controller directly calls `makeSendEmailUseCase().execute()` to send the password reset email. According to the GEMINI.md rules: *"Never bypass the outbox mechanism for asynchronous notifications."* This means if the email fails to send, the user has a valid reset token in the DB but never received the email. There's no retry mechanism.

The controller does log the failure (L43), but the user has already received a 200 response. There's no way to recover automatically.

**Impact**: Under SMTP outages, password reset emails will be silently lost — the user will have a token they never received, and there's no retry.

**Remediation**: Route the password reset email through the Outbox Pattern, same as form submissions.

---

## 📊 Findings by Category

| Category | Findings |
|----------|----------|
| Result Pattern Violations | C-1, C-2, C-3, M-2, M-3 |
| Design Pattern Issues (GoF / SOLID) | H-5, M-1, M-5, M-6, M-8, M-9 |
| Potential Bugs / Logic Errors | H-3, H-4, M-4, M-7 |
| Potential Memory Leaks | H-1, H-2 |
| Security Concerns | H-6, H-7 |
| Architectural Violations | M-10 |

---

## Priority Remediation Order

> [!IMPORTANT]
> Recommended order of remediation based on production risk:

1. **C-1** — Fix email strategy throws (outbox poison-pill risk)
2. **C-3** — Fix `processSingleEvent` throw (silent event stalls)
3. **C-2** — Align ViaCEP with other providers (LSP violation)
4. **M-10** — Route forgot-password through outbox (lost emails)
5. **H-3** — Fix registration race condition (concurrent duplicate risk)
6. **H-5** — Fix `FormsSubmission` instanceof usage
7. **H-4** — Fix falsy-field bug in UpdateUser
8. **H-6** — Add Zod schema to search controller
9. **H-7** — Fix internal ID logging
10. Remaining medium items as technical debt backlog

---

## Positive Observations

> [!TIP]
> The codebase demonstrates several excellent patterns worth noting:

- ✅ **Result Pattern adoption** is very thorough — the vast majority of the codebase correctly uses `ok()`, `err()`, `isOk()`, `isErr()` 
- ✅ **Resilient provider chains** with `failureMode`-based routing are well-designed and avoid `instanceof`
- ✅ **TransactionalUseCaseDecorator** is a clean GoF Decorator application for transaction management
- ✅ **Outbox Pattern** implementation with distributed locks, idempotency keys, and recovery is production-grade
- ✅ **ResilientCache** with negative caching, jitter, dedup, and circuit breaker is sophisticated and well-thought-out
- ✅ **Error hierarchy** (`AppError` → `DomainError` / `InfrastructureError` / `SystemError`) is clean
- ✅ **Factory functions** properly inject dependencies without controllers knowing about infrastructure
- ✅ **Graceful shutdown** in `worker.ts` handles signals and cleanup correctly
