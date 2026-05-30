# GEMINI.md

## Project Overview

**EvangelismoDigitalBackend** is a Node.js backend application built with Fastify, TypeScript, Prisma ORM, PostgreSQL, Redis, and BullMQ.

The platform manages:

* User authentication and authorization
* User profiles and account management
* Church discovery and geolocation services
* Contact and ministry-related forms
* Decision for Christ workflows
* Transactional email dispatching
* Background job processing
* Outbox event orchestration

This branch represents a strategic migration from exception-based control flow to a strongly typed Result Pattern architecture.

---

# Mission

The primary objective of this codebase is to provide a maintainable, highly testable, and resilient backend system with predictable error handling and explicit domain boundaries.

The code should prioritize:

1. Type safety
2. Explicit behavior
3. Separation of concerns
4. Testability
5. Performance
6. Reliability under external provider failures

---

# Technology Stack

## Runtime

* Node.js 20+
* TypeScript (strict mode)

## Web Layer

* Fastify
* Fastify JWT
* Fastify Rate Limit
* Async Local Storage

## Database

* PostgreSQL
* Prisma ORM

## Background Processing

* Redis
* BullMQ

## Testing

* Vitest
* Docker-based integration testing
* k6 load testing

---

# Architectural Principles

## Dependency Inversion

Always depend on abstractions.

Use Cases must never directly depend on:

* Prisma Client
* Fastify
* Redis clients
* External SDKs

Instead, depend on interfaces defined inside:

```text
/src/core/contracts
```

Infrastructure implementations are injected into use cases.

---

## Single Responsibility

Controllers:

* Parse requests
* Validate inputs
* Invoke use cases
* Map results to HTTP responses

Controllers must not contain business rules.

Business logic belongs exclusively inside:

```text
/src/use-cases
```

---

## Explicit Error Handling

Never use exceptions for business flow.

Avoid:

```typescript
throw new Error("User not found");
```

Prefer:

```typescript
return new UserNotFoundError();
```

All failures must be represented explicitly in the Result Pattern return type.

---

# Result Pattern Standard

## Definition

```typescript
export type ResultPattern<S, F> = S | F;
```

Where:

* S = Success type
* F = Failure type

---

## Success Example

```typescript
return {
  user,
};
```

---

## Failure Example

```typescript
return new UserNotFoundError();
```

---

## Controller Mapping

Controllers must map domain errors using:

```text
http-error-mapper.ts
```

Controllers should never inspect internal repository behavior.

---

# Error Design Rules

Every failure must:

* Have a dedicated error class
* Contain a meaningful message
* Represent a domain concept
* Be mapped to an HTTP status

Avoid generic errors.

Bad:

```typescript
return new Error("Failed");
```

Good:

```typescript
return new ChurchNotFoundError();
```

---

# Repository Guidelines

Repositories are responsible only for:

* Data persistence
* Data retrieval

Repositories must not:

* Contain business rules
* Trigger external services
* Execute HTTP concerns

---

# Use Case Guidelines

Use Cases:

* Coordinate business rules
* Orchestrate repositories
* Orchestrate providers
* Return ResultPattern

Use Cases must never:

* Access Fastify request objects
* Access Fastify reply objects
* Generate HTTP responses

---

# Geolocation System

The geolocation subsystem is critical.

Providers may fail unexpectedly.

Always assume:

* Rate limits
* Timeouts
* Invalid responses
* Partial outages

The platform uses fallback chains.

Current providers include:

## Address Providers

* ViaCEP
* Brasil API
* Awesome API

## Geocoding Providers

* Nominatim
* LocationIQ
* Stadia Maps

When modifying this area:

* Preserve fallback behavior
* Preserve caching behavior
* Avoid provider lock-in

---

# Resilience Layer

The resilience layer exists to protect the application from external instability.

Files such as:

```text
resilient-cache.ts
```

must remain lightweight and deterministic.

Always prefer:

* Timeouts
* Fallbacks
* Graceful degradation

over:

* Hard failures
* Application crashes

---

# Outbox Pattern

The system uses a Transactional Outbox Pattern.

## Flow

1. Domain action occurs
2. Database transaction commits
3. Outbox event is persisted
4. Cron processor discovers event
5. Worker processes event
6. Email is dispatched

Never bypass the outbox mechanism for asynchronous notifications.

---

# Background Jobs

BullMQ jobs must be:

* Idempotent
* Retry-safe
* Observable

Assume a job may execute more than once.

Design accordingly.

---

# Performance Expectations

Critical routes include:

* Authentication
* Church proximity search
* Geolocation endpoints

Before introducing expensive operations:

* Review existing k6 tests
* Consider query complexity
* Consider cache opportunities

Avoid:

* N+1 queries
* Unbounded loops
* Repeated provider calls

---

# Prisma Guidelines

Prefer:

```typescript
select
```

over:

```typescript
include
```

when only a subset of fields is needed.

Avoid loading unnecessary relations.

Always consider query cost.

---

# TypeScript Standards

## Always

Use:

```typescript
strict
```

compatible code.

Prefer:

```typescript
type
```

for unions and composition.

Prefer:

```typescript
interface
```

for contracts.

---

## Avoid

```typescript
any
```

unless absolutely necessary.

---

# Testing Requirements

Whenever modifying behavior:

1. Update unit tests
2. Update integration tests when applicable
3. Ensure existing tests continue to pass

Prefer testing behavior rather than implementation details.

---

# Logging

Logs should be:

* Structured
* Actionable
* Context-aware

Never log:

* Passwords
* Tokens
* Secrets
* Sensitive personal information

---

# Security Rules

Never:

* Disable authentication checks
* Expose internal stack traces
* Trust client-provided identifiers without validation

Always validate external inputs.

---

# Code Review Checklist

Before completing any task:

* Does the code follow the Result Pattern?
* Does it avoid throwing exceptions?
* Does it respect Dependency Inversion?
* Does it preserve testability?
* Does it avoid unnecessary database queries?
* Does it preserve geolocation fallback behavior?
* Does it maintain outbox consistency?
* Are tests updated?

If any answer is "No", revise the implementation.

---

# Instructions for AI Agents

When assisting in this repository:

1. Understand existing patterns before introducing new ones.
2. Preserve architectural consistency.
3. Prefer modifying existing abstractions over creating parallel ones.
4. Follow the Result Pattern strictly.
5. Do not introduce exception-driven business flow.
6. Keep solutions simple, explicit, and testable.
7. Respect existing module boundaries.
8. Favor maintainability over cleverness.
