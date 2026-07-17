# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Backend for "Evangelismo Digital" — a Fastify + TypeScript API on Node 20+, using Prisma (PostgreSQL + PostGIS) for persistence, Redis for rate-limiting/caching/distributed-locking, and BullMQ for background jobs. User-facing messages and comments are in Brazilian Portuguese; keep that convention when adding them.

## Commands

```bash
# Dev (uses .env, hot reload)
npm run dev                 # API server (src/server.ts)
npm run start:worker        # Background worker (src/worker.ts)

# Build & prod
npm run build               # tsup -> dist/server.js + dist/worker.js
npm run start:prod          # node dist/server.js

# Lint / format
npm run lint                # eslint src/
npm run lint:fix
npm run format              # prettier

# Database (Prisma)
npm run db:generate         # prisma generate
npm run db:migrate:dev      # prisma migrate dev
npm run db:reset            # generate + migrate reset --force + seed
npm run db:seed
npm run db:deploy           # migrate deploy + generate + seed (prod)
```

### Tests (Vitest, project-based)

Test suites are defined as named **projects** in `vite.config.mts`. Run a project with `vitest run --project <name>`. Convenience scripts:

```bash
npm run test:unit:use-cases       # all use-case unit tests
npm run test:unit:users           # single domain (users, churches, forms, messaging, geo-provider, ...)
npm run test:unit:resilient-cache
npm run test:e2e                  # e2e controllers (needs Docker Postgres)
npm run test:e2e:users
npm run test:coverage
npm run test:ui

# Run a single test file directly:
npx vitest run --project unit-users src/use-cases/users/reset-password-use-case.spec.ts
```

E2E projects use a custom Vitest environment (`prisma/vitest-environment-prisma/prisma-docker-environment.ts`) and require the Docker Postgres/Redis stack to be running (`docker-compose up`). When running the API on the host (`npm run dev`), Redis must be reachable at `localhost:6379` — the `redis` hostname only resolves inside the Docker network.

## Path aliases

Imports use `tsconfig.json` path aliases (also resolved in tests via `vite-tsconfig-paths`): `@env/*`, `@lib/*`, `@http/*`, `@controllers/*`, `@use-cases/*`, `@repositories/*`, `@schemas/*`, `@templates/*`, `@utils/*`, `@tps/*`. Note that `core/*` and `errors/*` are imported by their `baseUrl`-relative paths (`src/`), not aliases.

## Architecture

Clean-architecture layering: **HTTP controllers → use-cases → repositories → Prisma/Redis**. Dependencies point inward via interfaces defined in `src/core/contracts/`; concrete implementations live in `src/repositories`, `src/providers`, `src/lib`.

### Result pattern (central convention)

This codebase does **not** throw for expected failures across the use-case/repository boundary. Instead it uses a `Result<T, E>` discriminated union (`src/core/shared/result.ts`):

- Return success with `ok(value)`, failure with `err(appError)`.
- Guard with `isOk(result)` / `isErr(result)`. On failure, propagate by returning the failure result as-is (`if (isErr(x)) return x`).
- Repositories return `Result<T, AppError>`; use-cases return `Result<Response, AppError>`.
- Controllers unwrap the result and, on failure, delegate to `HttpErrorMapper.map(result.error, reply)`.

When adding a use-case or repository method, keep this style — never throw a domain/expected error; return `err(...)`.

### Error hierarchy

All app errors extend `AppError` (`src/errors/app-error.ts`), which carries an `ErrorType` (maps to HTTP status via `toHttpStatus`), a user-safe `body` (`code`/`message`/`issues`), and an optional `failureMode` (`RETRYABLE` | `NOT_FOUND`) used by resilient provider chains.

- `DomainError` — safe, user-facing; sent to the client as-is by both `HttpErrorMapper` and the global error handler.
- `InfrastructureError` / `SystemError` — logged fully, captured in Sentry, and **sanitized** before reaching the client.

`HttpErrorMapper` (used in controllers) only serializes `DomainError`; it **rethrows** infrastructure/system/unknown errors so the global Fastify error handler (`src/http/plugins/error-handler.plugin.ts`) sanitizes them. That plugin is the single place handling `ZodError`, `SyntaxError`, `DomainError`, `AppError`, Fastify internal errors, and unknowns.

### Dependency wiring (factories)

Use-cases are hand-wired via `make*` factory functions in `src/use-cases/factories/` (and `src/use-cases/forms/factories/`). Controllers call the factory, not constructors directly. A factory constructs the Prisma repository, its `PrismaErrorMapper` (with a domain-specific error-mapping table from `src/repositories/prisma/errors/`), and any collaborating use-cases. There is no DI container.

### HTTP plugin pipeline

`src/app.ts` registers plugins in a deliberate order (each documented inline): async-context (ALS with per-request `requestId` via uuidv7) → CORS → rate-limit → cookie → analytics → JWT → request-lifecycle (JWT extraction, `userId` population, logging) → memory-monitor → error-handler → routes. Routes are grouped in `src/http/routes.ts` by prefix (`/users`, `/health`, `/forms`, `/churches`, `/analytics`).

Request context (`requestId`, `userId`) flows through `AsyncLocalStorage` (`src/lib/async-local-storage`, exposed via `getRequestId()`/`getUserId()` from `@lib/logger`), so logging and Sentry scoping stay request-isolated without threading params.

### Resilient providers (geo / address / church-routing)

External API integrations under `src/providers/` use a two-level resilience design:

- **Decorator** (`*.decorator.ts`) wraps a raw provider with per-provider Redis rate-limiting, timeouts, and error mapping, translating raw failures into `AppError`s tagged with a `FailureMode`.
- **Resilient chain** (`ResilientGeoProvider`, etc.) holds an ordered list of decorated providers and advances to the next only when the current one fails with `failureMode === RETRYABLE`; it bails immediately on `NOT_FOUND` or untagged errors. **Routing is driven entirely by `error.failureMode` — no `instanceof` branching.**

When adding a provider, implement the raw interface, wrap it in the decorator, and add it to the chain; declare its `failureMode` on the errors it produces rather than special-casing in the chain.

### Background jobs (outbox + mail worker)

`src/worker.ts` is a separate process running: a BullMQ mail worker (`@lib/workers/mail-worker`), an `OutboxProcessor` driven both by a Redis pub/sub signal (`OutboxSignal`) for low latency and a `node-cron` sweep (`startOutboxCron`) as a safety net. The outbox pattern (`src/use-cases/outbox-event`, `OutboxEventType` in Prisma) guarantees at-least-once delivery of async side-effects (e.g. emails). `OutboxProcessor` uses a `DistributedLock` (Redis) to avoid duplicate processing. Note the documented horizontal-scaling caveat in `worker.ts`: multiple worker pods would each run the cron and contend on the lock — leader election is the suggested fix before scaling out.

### Repositories & testing doubles

Each aggregate has a repository interface in `src/core/contracts/repository/`, a Prisma implementation in `src/repositories/prisma/`, and an in-memory implementation in `src/repositories/in-memory/` used by unit tests. Prisma repositories receive a `DatabaseContext` and one or more `PrismaErrorMapper`s that translate Prisma errors into typed `AppError`s.

## Config & environment

- Env is validated/typed centrally via `@env/index` (Zod). Add new env vars there and to `.env.example`.
- Rate limits for every route group are env-driven (`HTTP_RATE_LIMIT_*`).
- Zod is configured for Portuguese locale (`z.config(z.locales.pt())` in `app.ts`).
- Sentry is initialized first thing in both `server.ts` and `worker.ts` (no-ops without `SENTRY_DSN`).
- PostGIS is required (used for nearest-church geospatial queries); the DB image is `postgis/postgis`.
- Observability stack (Prometheus/Grafana/Alertmanager, `fastify-metrics`/`prom-client`) — see `docs/prometheus_grafana.md`.
