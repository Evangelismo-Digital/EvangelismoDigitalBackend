# Dependency Decisions

This is an append-only ADR (Architecture Decision Record) log for dependency choices, complying with step 5 of the rule in `CLAUDE.md`.

## Category C Rejections (2026-09-10)

These are evaluations of existing libraries that were rejected in favor of custom code, recorded so they are not silently redone.

### C1. `neverthrow` vs `core/shared/result.ts`
- **Decision**: **REJECT**
- **Reason**: `neverthrow` is the established Result library for TypeScript, but its value is its combinator API (`.map`, `.andThen`, `ResultAsync`). This codebase uses an `if (isErr(x)) return x` propagation style mandated by `CLAUDE.md`. Adopting `neverthrow` would mean either a mechanical rename that gains nothing or rewriting control flow in ~349 files. The local implementation is 23 lines with no defect and no maintenance cost.
- **Re-evaluate when**: The team adopts combinator-style chaining as the house convention.

### C2. `@epic-web/cachified` vs `ResilientCache`
- **Decision**: **REJECT as a replacement**
- **Reason**: `ResilientCache` is a cache fused with the codebase's `Result`/`AppError` vocabulary, `failureMode`-driven negative-TTL policy, detached-`Deadline` single-flight semantics, and cockatiel breaker/bulkhead composition. Cachified models none of those.
- **Re-evaluate when**: Provider latency makes stale-while-revalidate necessary. In that case, implement natively and keep the rejection.

### C3. `redlock` vs `DistributedLock`
- **Decision**: **REJECT**
- **Reason**: The `redlock` library implements the multi-node Redlock algorithm. This deployment has one Redis instance, so the quorum machinery is pure overhead. Moreover, Redlock's safety is disputed. The existing `DistributedLock` is a correct single-instance lock (`SET NX PX`).
- **Re-evaluate when**: Redis becomes a multi-node cluster where the algorithm's guarantees actually apply.

### C4. `ua-parser-js` vs `user-agent-parser.ts`
- **Decision**: **REJECT**
- **Reason**: `ua-parser-js v2` dropped MIT for dual AGPLv3 + commercial "PRO" licensing, making it incompatible with a closed-source backend without a paid license. A hand-rolled parser is kept because only three coarse buckets are needed.
- **Re-evaluate when**: Never on license grounds. Move to UA Client Hints (`Sec-CH-UA-Platform`, etc.) if fidelity must improve.

### C5. `undici` / native `fetch` vs `axios`
- **Decision**: **REJECT**
- **Reason**: Node 22 ships with native `fetch` and `undici`, but `axios@1.20.0` is actively maintained and this codebase's error classification is built on it (`isAxiosError` mappings). Switching rewrites the error taxonomy the resilient-provider chain routes on, for no capability gain.
- **Re-evaluate when**: `axios` becomes unmaintained, or the error taxonomy is being rewritten anyway.
