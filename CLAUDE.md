# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Backend for "Evangelismo Digital" — a Fastify + TypeScript API on Node 20+, using Prisma (PostgreSQL + PostGIS) for persistence, Redis for rate-limiting/caching/distributed-locking, and BullMQ for background jobs. User-facing messages and comments are in Brazilian Portuguese; keep that convention when adding them.

### Prefer Existing Dependencies Over Custom Implementations

When given a task that requires implementing a technical feature, **always evaluate whether an existing solution should be reused before writing custom code**.

Follow this decision process:

1. **Inspect the current dependencies first.**
   Check the project's existing dependencies and determine whether any of them already provide the required functionality, either directly or through an appropriate API.

2. **If no existing dependency provides the functionality, research established libraries.**
   Search for well-known, reputable, actively maintained, and trustworthy libraries that can provide the required functionality and are compatible with the project's technology stack.

3. **Prefer established solutions over custom implementations.**
   If a suitable existing dependency is found, use it rather than implementing the functionality from scratch.

4. **Implement custom code only as a last resort.**
   Write a custom implementation **only when**:

   - no suitable existing dependency is already installed;
   - no reputable external library provides the required functionality; or
   - existing libraries were evaluated but do not satisfy the project's requirements.

5. **Do not add dependencies unnecessarily.**
   If an existing dependency already solves the problem, do not introduce another library. When considering a new dependency, evaluate its maintenance status, reputation, adoption, compatibility, security, license, and whether it is actively maintained.

The goal is to **reuse reliable existing solutions whenever possible and minimize unnecessary custom code and dependencies**.

## Commands

```bash
# Dev (uses .env, hot reload)
npm run dev                 # API server (src/server.ts)
npm run start:worker        # Background worker (src/worker.ts)

# Build & prod
npm run build               # tsup -> dist/server.js + dist/worker.js
npm run start:prod          # node dist/server.js

# Static checks
npm run typecheck           # tsc --noEmit
npm run lint                # eslint src/
npm run lint:fix
npm run format              # prettier --write
npm run format:check
npm run knip                # dead code / unused exports

# Quality & security analysis
npm run sonar               # SonarQube: start + provision + reports + scan + gate
npm run sonar:up            # just start the stack (docker-compose.sonar.yml)
npm run sonar:scan          # scan with the reports already on disk
npm run sonar:report        # re-read the last analysis without re-scanning
npm run sonar:reset         # wipe the volumes; next run re-provisions from code
npm run security:scan       # njsscan + Semgrep + Snyk + ESLint + Sonar, merged
npm run check:duplication   # jscpd — copy-paste detection (gate: 3%)

# Database (Prisma)
npm run db:generate         # prisma generate
npm run db:migrate:dev      # prisma migrate dev
npm run db:reset            # generate + migrate reset --force + seed
npm run db:seed
npm run db:deploy           # migrate deploy + generate + seed (prod)
```

Prisma 7: datasource URL, migrations path, and seed command live in `prisma.config.ts` (not in `schema.prisma`/`package.json`). It resolves the DB URL as `DATABASE_URL_LOCAL ?? DATABASE_URL` and uses `SHADOW_DATABASE_URL` for migrate drift detection. The config deliberately does **not** import `src/env` (full Zod validation would crash env-less CLI runs, e.g. CI's static job); it loads `dotenv/config` and reads `process.env` directly, falling back to an unroutable `.invalid`-host placeholder URL so non-connecting commands (`generate`, `validate`) work without env while connecting commands fail fast with a clear error.

### Tests (Vitest, project-based)

Test suites are defined as named **projects** in `vite.config.mts`. Run a project with `vitest run --project <name>`. Convenience scripts:

```bash
npm run test:unit:use-cases       # all use-case unit tests
npm run test:unit:users           # single domain (users, churches, forms, messaging, geo-provider, ...)
npm run test:unit:resilient-cache
npm run test:e2e                  # e2e controllers (needs Docker Postgres)
npm run test:e2e:users
npm run test:integration:cache        # Redis-only cache suite (in CI)
npm run test:integration:repositories # Postgres/PostGIS repository contract (in CI)
npm run test:integration:full         # everything, opt-in, not in CI
npx vitest run --project integration-jobs  # Redis-only BullMQ scheduler suite (in CI)
npm run test:coverage
npm run test:ui

# Run a single test file directly:
npx vitest run --project unit-users src/modules/auth/services/reset-password.service.spec.ts
```

E2E projects use a custom Vitest environment (`prisma/vitest-environment-prisma/prisma-docker-environment.ts`) and require the Docker Postgres/Redis stack to be running (`docker-compose up`). When running the API on the host (`npm run dev`), Redis must be reachable at `localhost:6379` — the `redis` hostname only resolves inside the Docker network.

`unit-repositories` deliberately excludes `*.integration.spec.ts`: the Prisma/PostGIS contract suite used to be collected there, which made `npm run test:unit:all` — the Docker-free gate the pre-commit hook runs — fail the moment the database container stopped. It now runs as its own `integration-repositories` project, which **is** in both CI allowlists, so the coverage did not move, only the label.

Three integration projects are cheap enough to gate every push and are listed in **both** `ci.yml` and `scripts/ci-local.sh` (keep them in lockstep): `integration-cache` (Redis only, `src/infra/cache`), `integration-jobs` (Redis only, `src/infra/outbox/jobs`) and `integration-repositories` (Postgres only, `src/modules/**/repositories` and `src/infra/outbox/repositories`). They are split by the infrastructure they need, which is what keeps them out of the Docker-free unit gate. The catch-all `integration` project — `*.integration.spec.ts` anywhere under `src`, using the Prisma Docker environment — is opt-in and **not** in CI; `src/infra/mail/nodemailer-mail-sender.integration.spec.ts` (real SMTP dialogue over `node:net`) lives there.

The CI coverage step uses an explicit project **allowlist** that omits `e2e-api-providers-fallback-strategy` and `e2e-users`, so those two projects do not run in CI. `e2e-api-providers-fallback-strategy` calls **live** geocoding APIs (LocationIQ, Nominatim, ViaCEP, BrasilAPI) and needs two things set up before it can be green locally:

1. **A real LocationIQ token in `.env.test.local`** (gitignored). The tracked `.env.test` carries a deliberately fake token, and `.env.test` **beats `.env.local`** in Vite's `loadEnv` order (`.env` → `.env.local` → `.env.<mode>` → `.env.<mode>.local`, later wins) — so only `.env.test.local` overrides it. With the fake token LocationIQ answers `401 Invalid key`, which is RETRYABLE, so the chain falls through to Nominatim and Scenarios 4 and 7 (`expect(spyNominatim).not.toHaveBeenCalled()`) fail. That is visually identical to the quota flakiness in point 3, which is exactly why it went undiagnosed: the symptom was attributed to the rate limit and the token was never checked.
2. **A seeded database** (`npm run db:seed`). This project runs against the shared `public` schema, which the other e2e suites truncate; with an empty `churches` table every success scenario answers 404 instead of 200.
3. Only then does the genuine flakiness apply: LocationIQ's free tier limits to ~2 req/s, so running the scenarios back-to-back can return HTTP 429 and fall through to Nominatim. Run the project in isolation and space executions out.

## Agent Quality & Mutation Testing Gauntlet

This is **non-negotiable** for any change to a controller, use-case/service, repository, provider, lib module, or BullMQ job handler. Write the tests before or alongside the code, and pass every gate below before declaring work complete.

### Layers

| Layer                        | Tooling here                                                                                                                                            | Objective                                                                                                                                             | Gate                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0 — Static & types           | `npm run typecheck`, `npm run lint`                                                                                                                     | no hallucinated syntax / API calls                                                                                                                    | 0 type errors; 0 lint **errors** (see Layer 4 note)                                                    |
| 1 — Acceptance (Gherkin)     | `@amiceli/vitest-cucumber` + `supertest` — `npm run test:acceptance`                                                                                    | business intent from `features/*.feature` over the HTTP boundary                                                                                      | 100 % green steps; no pending/undefined step                                                           |
| 2 — Unit & domain invariants | Vitest `unit-*` projects, in-memory doubles — `npm run test:unit`                                                                                       | boundaries, calculations, **every `err(...)` branch**, state machines                                                                                 | zero-I/O, < ~1 ms/test, 100 % pass                                                                     |
| 3 — Property-based           | `fast-check` inside `*.spec.ts`                                                                                                                         | thousands of randomised inputs at pure functions (Result helpers, geo math, validators, template rendering)                                           | no falsifying case                                                                                     |
| 4 — Structural & complexity  | `eslint` (`complexity`, `sonarjs/cognitive-complexity`, `max-lines-per-function`, `max-depth`, `max-params`, `import/no-cycle`), `npm run check:cycles` | no monolithic / tangled generated code                                                                                                                | Cyclomatic ≤ 6; cognitive ≤ 10; function ≤ 30 lines; `max-depth` ≤ 3; ≤ 5 params; no new circular deps |
| 4b — SonarQube               | `npm run sonar` (server in `docker-compose.sonar.yml`)                                                                                                  | the checks ESLint has no equivalent for: cognitive complexity on the dashboard, duplication, coverage and test-execution history, "new code" tracking | quality gate `Evangelismo Strict` = OK; **0 open issues**; 0 unreviewed hotspots                       |
| 4c — Security findings       | `npm run security:scan` — njsscan + Semgrep security rulesets + ESLint security rules + Sonar's security findings, merged                               | vulnerable _patterns_ in the source (a different question from OSV's lockfile and gitleaks' diff)                                                     | 0 blocking findings; anything else justified in `security-suppressions.json`                           |
| 5 — Mutation gauntlet        | Stryker — `npm run test:mutation:scoped -- "<changed globs>"`                                                                                           | kill deliberate bugs planted in the AST                                                                                                               | mutation score ≥ 85 % on the changed diff                                                              |
| 6 — CI parity                | `npm run ci:local` (`scripts/ci-local.sh`)                                                                                                              | prove the change survives every gate CI applies, not just the ones you thought to run                                                                 | exit 0, all stages green — **mandatory, run serially**                                                 |

The Layer 4 rules are `error` repo-wide — the legacy backlog was cleared, so a new violation fails `npm run lint`, `ci:static` and the `PostToolUse` hook alike. `npm run lint` already runs with `--max-warnings 0`; `npm run lint:complexity` is the same check under a name that says what it is for.

Beyond complexity, the ESLint config also enforces **no dead code** (`unused-imports`, `no-unused-vars` with `args: 'all'`, `sonarjs/no-dead-store`, `no-unnecessary-condition`, plus Knip for whole files/exports), **no deprecated code** (`@typescript-eslint/no-deprecated` for any `@deprecated` JSDoc, `n/no-deprecated-api` for Node built-ins the runtime itself deprecated), **Node/backend practice** (`no-floating-promises`, `no-misused-promises`, `n/no-sync`, `n/prefer-node-protocol`, `n/no-unsupported-features/*` checked against `engines.node`) and **security** (`eslint-plugin-security` + the `sonarjs` security rules). Type-aware rules require the TS program, so linting is slower than it used to be — that is the cost of `no-deprecated` and `no-floating-promises` working at all.

**Turning a rule off is a documented decision, never a shortcut.** Every disabled or scoped rule in `eslint.config.mjs`, `scripts/sonar-configure.mjs` and `sonar-project.properties` carries the finding count and the reason inline, and the full list with its rationale is in [`docs/sonarqube-quality-gate.md`](docs/sonarqube-quality-gate.md) — including the two cases where following the tool's advice would have introduced a bug. If you silence something, write down why, or a later reader cannot tell your judgement from an abandoned fix.

Layer 1 lives in `features/*.feature` (Gherkin) with step definitions colocated as `src/http/controllers/<area>/<area>.acceptance.spec.mts` — `.mts` because `@amiceli/vitest-cucumber` is ESM-only. See [`features/README.md`](features/README.md).

### Golden rules

- **Red-Green-Refactor.** Write the failing acceptance + unit tests first, run them, confirm they fail _for the reason you expect_, then write the minimum code to pass. Refactor only with the suite green.
- **Assertion rigor.** No hollow/tautological assertions — `expect(result).toBeDefined()` is not acceptable where a specific value or `Result`/state transition is required. A test that still passes when you delete the function body is not a test.
- **Fast-to-slow.** Never trigger Layer 5 (mutation) before Layers 0–2 are 100 % green. Mutation testing never runs in the inner loop or in the `Stop` gate — it is manual / CI.
- **Fail-fast.** On any layer failure, stop, fix the root cause, and re-run _that_ layer before moving on.
- Never mark a task complete with a failing or skipped test. If a test is genuinely wrong, say so and explain — do **not** silently delete it, weaken its assertion, or add `.skip`.

### Per-artefact requirements

- **Job handlers** additionally get unit cases for: success, `RETRYABLE` failure, permanent failure, idempotent re-delivery — plus an assertion that the relevant Prometheus counter moved.
- **Repositories / providers / adapters / controllers** additionally get a Layer 4 integration test (`npm run test:e2e`, real Docker Postgres + Redis) exercising real query behaviour and contract serialisation.
- **Regression**: every bug fix — including one you introduced and caught yourself mid-refactor — adds a
  test named for the **symptom**, colocated as `<symptom>.regression.spec.ts` next to the unit tests
  (`**/*.spec.ts` matches, so every `unit-*` project and both CI allowlists pick them up automatically).
  Requirements, all of them:
  - It must **fail on the pre-fix code.** Prove it: revert the fix, run the spec, restore. A regression
    test that has never been seen red is an assumption, not a guard.
  - Its file docblock states what broke, why it mattered, and which defect id it belongs to.
  - It carries a **counterweight** case asserting the fix did not overshoot — "does not cache transient
    failures" pairs with "still caches NOT_FOUND", or the next refactor satisfies it by doing nothing.
- Property-based tests belong on pure functions; no test may `sleep` — use fake timers. A test that waits
  on a real timer fails under load rather than on logic, which is worse than no test.

### The per-change gate

Run the **whole** checklist below after **every single change** — not once per task, not once per phase,
and not only when something feels risky. A "change" is any edit that lands in `src/`: a refactor, a
one-line fix, a renamed symbol, a new test double. Batching the verification to the end of a task is
what lets a regression ride along inside a larger diff and become expensive to locate.

This is not ceremony. In this repo the practice has already caught, among others: single-flight
silently breaking because an extracted helper added a microtask boundary; a `mapFetchThrow`
simplification destroying error classification; and a test double whose missing field would have made
a provider report itself as busy in production. None of those were suspected before the suite was run.

**Every** change ships with unit tests, integration tests, a regression test when it fixes a bug,
a clean SonarQube gate, a clean security report, mutation testing, and a green `ci:local`. None of these steps is conditional or optional, and none may
be skipped because a change "looks small" — the point is to prove no bug was introduced, and that proof
is worth least exactly where you were most confident. Run all of it:

1. `npm run typecheck`
2. `npm run lint` — and `npx eslint --max-warnings 0 <each changed .ts>` (Layer 4)
3. `npm run test:unit:all && npm run test:acceptance`
4. `npm run test:integration` (e2e) — plus `npm run test:integration:cache`,
   `npm run test:integration:repositories` and `npm run test:integration:full` when the change
   touches a repository, provider/adapter, cache, controller, or anything wired to Redis/Postgres
5. `npm run knip` — no unused file, export, type or dependency (the no-dead-code gate ESLint cannot
   see across module boundaries)
6. `npm run sonar` — quality gate OK, **zero** open issues, zero unreviewed hotspots. Reads back as
   `reports/sonar/SONAR-REPORT.md`, which lists every finding as `file:line` with its rule, so it is
   worth reading rather than just passing. From a warm server `npm run sonar:reports && npm run
sonar:scan` is enough
7. `npm run security:scan` — zero blocking findings in `reports/security/SECURITY-REPORT.md`. Fix
   them; if one is genuinely a false positive, record it in `security-suppressions.json` with a
   justification that explains _why that point is safe_. Never silence the tool
8. `npm run test:mutation:scoped -- "<changed src globs>"` — kill every survivor (boolean flip,
   boundary operator, deleted return) with a targeted test.
   **Use the `:scoped` script, not `test:mutation -- --mutate`.** Stryker's CLI `--mutate`
   _replaces_ the `mutate` array from `stryker.conf.mjs` instead of intersecting with it, and that
   array is where the exclusions live (`!src/**/*.spec.ts` and friends). Passing `--mutate` by hand
   therefore starts planting mutants in the **spec files themselves**; nothing asserts on a test's
   own source, so those mutants survive and drag the score under the gate for a reason unrelated to
   your change. Measured here: the provider chain scored **45.68 %** that way and **97.07 %** with
   the exclusions restored — same code, same tests. `scripts/stryker-scoped.mjs` re-appends them
   straight from the config so the two cannot drift.
   Other flags still apply: repeating `--mutate` **overrides** rather than appends (pass one
   comma-separated list), and `--incremental false` is parsed as a config filename — use
   `--incrementalFile <path>` to scope a run. Forward extra Stryker flags after a bare `--`:
   `npm run test:mutation:scoped -- "src/x/**/*.ts" -- --incrementalFile /tmp/run.json`.
   A full unscoped `npm run test:mutation` is a **report, not a gate** (stryker.conf.mjs says so):
   it legitimately sits below 85 % because untested wiring like the `make*` factories, `app.ts` and
   `metrics-server.ts` is in the denominator with no unit tests behind it
9. **`npm run ci:local`** — the final gate. Mirrors every CI job (security scanners, coverage, tsup
   build, Docker image + smoke test) **and runs steps 6 and 7 itself**, so it is the one command that
   proves the whole set. Must exit 0. It catches what the `PostToolUse` hook cannot: the hook only
   formats and lints files edited through Edit/Write, so anything written by a script reaches CI
   unformatted unless `ci:local` says otherwise

`npm run verify` chains steps 1–3 only; it is not a substitute for 4–9.

**`ci:local` must be run serially.** It manages the compose stack itself and binds port 3333, and it
aborts if anything already answers there (`scripts/ci-local.sh:140`). Two overlapping invocations —
or a `npm run dev` left running — will fail the run for reasons unrelated to the code.

A test that passes the moment you write it has proved nothing yet. Confirm each new test fails
against the un-fixed code (revert the fix, or hand-plant the mutant, then restore) before treating it
as a gate. Where a suite fails for environmental reasons — Docker down, a rate-limited live API —
prove it by reproducing the same failure on a clean tree (`git stash`) rather than assuming.

## Autonomous operation

This repo has **no** `.claude/settings.json` and no `.claude/settings.local.json`, by design. Permissions, permission mode, hooks, and remote control are dictated **exclusively** by the user-level `~/.claude/settings.json`. Do not create a project-level settings file (or reintroduce `defaultMode` anywhere in the repo) — project settings outrank user settings and would override the global configuration.

`.claude/hooks/` holds two scripts. They **are** wired — from the user-level `~/.claude/settings.json`, never from a project settings file — and each command is guarded so it only runs when `$CLAUDE_PROJECT_DIR` is this repository; in any other project the hook exits 0 immediately.

- **`format-and-typecheck.sh`** (`PostToolUse` on `Edit|Write`, timeout 120 s) — on every `src/**/*.ts` write: Prettier, then eslint `--max-warnings 0` (Layers 0 + 4), then `tsc --noEmit`. Exit 2 hands the failure back to the agent to fix.
- **`gate.sh`** (`Stop`, timeout 900 s) — refuses to finish while typecheck, lint, or unit tests are red; also runs acceptance + e2e when the Docker stack is up. Has a per-session anti-loop guard. Mutation testing is intentionally not in this gate.

Editing the scripts changes what runs; adding or removing a hook means editing `~/.claude/settings.json` (or `/hooks`). The hooks are a safety net, not the plan — still run the pre-completion checklist explicitly, since Layer 5 (mutation) never fires from a hook.

The agent does **not** run `git add` / `git commit` / `git push` — changes are left unstaged for the user to review and commit.

## SonarQube & the security report

The SonarQube stack lives in `docker-compose.sonar.yml` — deliberately a separate compose file and project from `docker-compose.yml`, because the app stack is torn up and down by the e2e suite while SonarQube is expensive to start (Elasticsearch) and holds the issue history that makes the gate's "new code" conditions mean anything.

The instance is provisioned **from code** (`scripts/sonar-configure.mjs`), idempotently: quality profiles with every non-deprecated `ts`/`js`/`secrets`/`docker`/`yaml` rule activated, rule parameters aligned with the ESLint thresholds, and the `Evangelismo Strict` quality gate. A wiped volume comes back identical, and no configuration exists only on one machine. Credentials live in `.sonar/` (gitignored, `0600`): the default `admin/admin` is rotated to a generated password on first boot, and an analysis token is stored alongside it.

`scripts/sonar-report.mjs` reads the analysis back into `reports/sonar/SONAR-REPORT.md` (plus machine-readable JSON) and exits non-zero on a failing gate — that is what makes it usable as a pipeline stage rather than a dashboard someone remembers to open.

**Snyk** runs in two parts. _Snyk Open Source_ (SCA) is active and gating — it uses a different advisory database from OSV-Scanner and caught `fast-uri` CVE-2026-84292/84394 that OSV did not report. _Snyk Code_ (SAST/taint) requires the entitlement to be enabled for the organization in the Snyk console; without it the CLI returns `SNYK-CODE-0005`/403 and the stage is reported as **not run** rather than clean. The credential goes in `.env.security` (gitignored, `0600`) — not `~/.bashrc`, whose stock interactivity guard makes exports invisible to every non-interactive shell, hook and CI runner.

The scan is deliberately **not** `--all-projects`: that walks the `.stryker-tmp` mutation sandboxes, whose stale lockfiles produced 102 findings against versions the project no longer uses.

**Dependency advisories** are gated by OSV-Scanner. Accepted ones are baselined in `osv-scanner.toml`, each with the reason _and_ its re-check command — two of the current three cannot be fixed or even overridden, because `snyk` ships `global-agent`/`roarr` as `bundleDependencies` and npm cannot rewrite what lives inside a package's own tarball. Read the header there before adding or removing an entry; OSV also prints "has unused ignores" for entries that are in fact working, so cross-check against the "Filtered N vulnerabilities" line rather than deleting on that message alone.

**Duplication** is gated by `jscpd` (`npm run check:duplication`, threshold 3 % in `.jscpd.json`), because SonarQube's token-level CPD misses restructured copy-paste: it scored the project at 0.7 % while two provider chains were 21 % duplicated.

**Snyk Code** adds semantic/taint analysis — it follows user-controlled values through the call graph, reaching injection and traversal bugs that only appear when source and sink are several functions apart. It needs a credential: `export SNYK_TOKEN=<token>` locally, or the `SNYK_TOKEN` repository secret in CI. Without it the stage **skips loudly** and the report marks it as not-run, because a report that certifies a scan which never happened is worse than a red pipeline.

`scripts/security-scan.sh` answers a different question from the scanners that were already here: OSV-Scanner reads the lockfile, gitleaks reads the diff, Semgrep's language packs read for correctness. This one reads the **source for vulnerable patterns** and merges njsscan, Semgrep's security rulesets, ESLint's security rules and Sonar's security findings into one list deduplicated by `file:line`. Suppressions go in `security-suppressions.json` with a justification.

Full decision record, including every rule that was switched off and why: [`docs/sonarqube-quality-gate.md`](docs/sonarqube-quality-gate.md).

## CI (`.github/workflows/ci.yml`)

Node is pinned via `.nvmrc`. Jobs: static checks (typecheck, lint, format check, `prisma validate`, Knip), secret scan (gitleaks), SAST (Semgrep OSS), security findings (`security-code` — njsscan + Semgrep security rulesets + ESLint, the server-free half of the local security stage), dependency vulnerabilities (OSV-Scanner — accepted/deferred advisories are baselined in `osv-scanner.toml` with reasons; revisit rather than treat as permanent), license compliance (Trivy), tests + coverage (unit + e2e), build verification (tsup), and Docker build validation with a container smoke test.

### Local CI gate (git hooks)

Husky hooks (installed automatically by `npm install` via the `prepare` script) enforce a tiered local gate:

- **pre-commit** (~1–2 min): `lint-staged` (ESLint + Prettier autofix on staged files), gitleaks scan of the staged diff, whole-project typecheck, and all unit-test projects (`npm run test:unit:all` — no Docker needed).
- **pre-push** (~8–15 min): `npm run ci:local` (`scripts/ci-local.sh`) — a 1:1 mirror of every CI job, including the security scanners (Docker images pinned to the same versions as ci.yml), the drift check + unit/e2e suite with coverage, the tsup build (into gitignored `.ci-local/dist`, since `dist/` is tracked), and the Docker image build + `/health/` smoke test. Requires Docker; starts the compose stack itself; refuses the smoke test if something else is on port 3333.

Both hooks source `.husky/use-nvmrc-node.sh` first, which puts the `.nvmrc` Node at the front of `PATH` so they run on the same version as CI rather than whatever the developer's shell defaults to. It resolves the version directory instead of sourcing `nvm.sh`, because git runs hooks under `/bin/sh` (dash on Debian/WSL) where loading nvm is slow and unreliable; it is a no-op for anyone on fnm/volta/asdf, warns when the running version still differs, and `HUSKY_SKIP_NODE_PIN=1` turns it off. Without it the hooks silently used a different Node **and npm** than every other command.

Keep `scripts/ci-local.sh` and `ci.yml` in lockstep when changing either (the vitest project allowlist especially). Escape hatch for emergencies: `--no-verify` — but the branch will still fail on GitHub, so prefer fixing locally. Note `ci:local` is slow mostly because of its last stage: the Docker image build plus smoke test can take ~35 min cold, a few minutes warm.

## Path aliases

Imports use `tsconfig.json` path aliases (also resolved in tests via `vite-tsconfig-paths`): `@config/*` (`src/config/*`), `@common/*` (`src/common/*`), `@infra/*` (`src/infra/*`), `@modules/*` (`src/modules/*`), `@tps/*` (`src/@types/*`), and `app` (`src/app.ts`).

## Architecture

NestJS module-based organization with clean-architecture layering: **`src/modules/<feature>/` (`controllers/` → `services/` → `repositories/`)**, backed by cross-cutting primitives in **`src/common/`**, environment config in **`src/config/`**, and technical adapters in **`src/infra/`**. Feature modules (`health`, `auth`, `users`, `forms`, `churches`, `analytics`) are composed in `src/app.module.ts`.

### Result pattern (central convention)

This codebase does **not** throw for expected failures across the service/repository boundary. Instead it uses a `Result<T, E>` discriminated union (`src/common/utils/result.ts`):

- Return success with `ok(value)`, failure with `err(appError)`.
- Guard with `isOk(result)` / `isErr(result)`. On failure, propagate by returning the failure result as-is (`if (isErr(x)) return x`).
- Repositories return `Result<T, AppError>`; services return `Result<Response, AppError>`.
- Controllers unwrap the result and, on failure, delegate to `HttpErrorMapper.map(result.error, reply)`.

When adding a service or repository method, keep this style — never throw a domain/expected error; return `err(...)`.

### Error hierarchy

All app errors extend `AppError` (`src/common/errors/app-error.ts`), which carries an `ErrorType` (maps to HTTP status via `toHttpStatus`), a user-safe `body` (`code`/`message`/`issues`), and an optional `failureMode` (`RETRYABLE` | `NOT_FOUND`) used by resilient provider chains.

- `DomainError` — safe, user-facing; sent to the client as-is by both `HttpErrorMapper` and the global error handler. Domain-specific error subclasses live in their owning `src/modules/<feature>/errors/`.
- `InfrastructureError` / `SystemError` — logged fully, captured in Sentry, and **sanitized** before reaching the client.

`HttpErrorMapper` (`src/common/filters/http-error-mapper.filter.ts`, used in controllers) only serializes `DomainError`; it **rethrows** infrastructure/system/unknown errors so the global Fastify error handler (`src/common/filters/error-handler.filter.ts`) sanitizes them. That plugin is the single place handling `ZodError`, `SyntaxError`, `DomainError`, `AppError`, Fastify internal errors, and unknowns.

### Dependency wiring (factories)

Services are hand-wired via `make*` factory functions in `src/modules/<feature>/factories/` (and `src/infra/mail/factories/`, `src/infra/outbox/factories/`). Controllers call the factory, not constructors directly. A factory constructs the Prisma repository, its `PrismaErrorMapper` (with a domain-specific error-mapping table from `src/modules/<feature>/repositories/errors/`), and any collaborating services. There is no DI container.

### HTTP plugin pipeline

`src/app.ts` registers plugins in a deliberate order (each documented inline): async-context (ALS with per-request `requestId` via uuidv7) → CORS → rate-limit → security-headers → `healthModule` (`/health`) → cookie → JWT → request-lifecycle (JWT extraction, `userId` population, logging) → request-deadline → error-handler → `appModule`. Feature modules are registered in `src/app.module.ts` by prefix (`/auth`, `/users`, `/forms`, `/churches`, `/analytics`).

The rate-limit plugin keeps **Redis as the single source of truth** — `@fastify/rate-limit` with the built-in `redis:` store, no local fallback and no second counting algorithm — and runs `skipOnError: true`. With `skipOnError: false` a Redis that merely got slow returned HTTP 500 to every caller, because the rate-limiter connection is deliberately impatient (`commandTimeout: 100`, `enableOfflineQueue: false`, `maxRetriesPerRequest: 0`): the limiter became the outage it exists to prevent. Failing open is the accepted trade, and it is only acceptable because it is **loud** — the plugin swallows the store error silently and offers no hook on it, so `RateLimitHealthProbe` (`src/infra/rate-limiter/rate-limit-health-probe.ts`) PINGs that same connection on a bounded interval (`REDIS_RATE_LIMIT_HEALTH_INTERVAL_MS`, 1 s–5 min, default 15 s) and publishes `http_rate_limit_redis_up` plus `http_rate_limit_infra_degraded_total` / `_recovered_total`. It probes on the rate limiter's own connection on purpose: a more forgiving client would report "Redis up" during exactly the slow-Redis incident this exists to catch. Alerts `HttpRateLimitSkippedRedisDown` (gauge at 0) and `HttpRateLimitFlapping` live in `prometheus/alerts.yml`, with two panels on the _Fastify HTTP & BullMQ_ dashboard. Note the opposite decision in `RedisRateLimiter`, which fails **closed** for outbound provider quotas: the reasoning for each is in the two files.

Request context (`requestId`, `userId`) flows through `AsyncLocalStorage` (`src/infra/logger/async-local-storage.ts`, exposed via `getRequestId()`/`getUserId()` from `@infra/logger`), so logging and Sentry scoping stay request-isolated without threading params.

### Resilient providers (geo / address / church-routing)

External API integrations under `src/infra/providers/` use a two-level resilience design:

- **Decorator** (`*.decorator.ts`) wraps a raw provider with per-provider Redis rate-limiting, timeouts, and error mapping, translating raw failures into `AppError`s tagged with a `FailureMode`.
- **Resilient chain** (`ResilientGeoProvider`, etc.) holds an ordered list of decorated providers and advances to the next only when the current one fails with `failureMode === RETRYABLE`; it bails immediately on `NOT_FOUND` or untagged errors. **Routing is driven entirely by `error.failureMode` — no `instanceof` branching.**

When adding a provider, implement the raw interface, wrap it in the decorator, and add it to the chain; declare its `failureMode` on the errors it produces rather than special-casing in the chain.

### Background jobs (outbox, mail worker, scheduled maintenance)

`src/worker.ts` is a separate process running three things:

1. **The mail worker** (`@infra/mail/workers/mail-worker`) — a BullMQ worker over `QUEUE.NAMES.MAIL`.
2. **`OutboxProcessor`**, driven by a Redis pub/sub signal (`OutboxSignal`) for low latency. The outbox pattern (`src/infra/outbox`, `OutboxEventStatus` in Prisma) guarantees at-least-once delivery of async side-effects (e.g. emails), and `OutboxProcessor` uses a `DistributedLock` (Redis) to avoid duplicate processing.
3. **Scheduled maintenance**, on BullMQ **Job Schedulers** — not `node-cron`, which was removed. `startMaintenanceScheduler` (`@infra/outbox/jobs/maintenance-scheduler`) upserts four schedulers onto `QUEUE.NAMES.MAINTENANCE`, and `startMaintenanceWorker` (`@infra/outbox/jobs/maintenance-worker`) consumes them.

The four schedules and their stable ids live in `QUEUE.SCHEDULER_IDS` / `CRON_SCHEDULES`: a 5-minute sweep, the midnight safety scan, the outbox retention purge at 03:00 and the analytics retention purge at 04:00. Each schedule is **one job with its phases inside**, never a job per phase, because the ordering between phases is load-bearing — the 5-minute sweep must expire events _before_ dispatching pending ones, or a just-expired PENDING would be emailed as a dead link.

No timezone is passed to `upsertJobScheduler` **on purpose**: BullMQ's cron-parser, like node-cron before it, resolves the pattern in the process-local zone, so naming a zone would move the windows in production (the container runs UTC). Adding one is a behaviour change, not a clarification.

**Failure policy** (`maintenance-worker.ts`): every phase runs even when an earlier one fails — a failing phase must not block the next — and the handler only decides afterwards. If any phase failed and attempts remain, it throws so BullMQ retries with backoff; on the final attempt it logs, reports to Sentry and swallows, leaving the next scheduled tick as the safety net. Sentry therefore sees terminal failures only, matching the mail worker's policy. One consequence to know: a swallowed final attempt completes rather than fails, so `bullmq_jobs{state="failed"}` never shows maintenance — `outbox_cron_failures_total{phase,outcome}` does, and the `MaintenancePhase*` alerts in `prometheus/alerts.yml` fire on it.

**Horizontal scaling.** Scheduled work is now safe under N pods: a Job Scheduler lives in Redis, every pod upserts the same id, and BullMQ emits one job per tick regardless of pod count. No leader election needed — the claim is proven in `maintenance-scheduler.redis-integration.spec.ts`. **Still open:** `OutboxSignal.subscribe` is pub/sub fan-out, so N pods would each receive the same event; today the safety comes from the deterministic BullMQ `jobId` (dedup) and idempotent `updateStatus`, not from a lock. Start there before adding a second worker pod.

### Repositories & testing doubles

Each aggregate colocates its repository interface (`*-repository.interface.ts`), contract runner (`*.contract.ts`), Prisma implementation (`prisma-*.repository.ts`), and in-memory test double (`in-memory-*.repository.ts`) inside `src/modules/<feature>/repositories/` (or `src/infra/outbox/repositories/`). Prisma repositories receive a `DatabaseContext` (`@infra/database/prisma/database-context`) and one or more `PrismaErrorMapper`s that translate Prisma errors into typed `AppError`s.

## Config & environment

- Env is validated/typed centrally via `@config/env/index` (Zod). Add new env vars there and to `.env.example`.
- Rate limits for every route group are env-driven (`HTTP_RATE_LIMIT_*`).
- Zod is configured for Portuguese locale (`z.config(z.locales.pt())` in `app.ts`).
- Sentry is initialized first thing in both `server.ts` and `worker.ts` (no-ops without `SENTRY_DSN`).
- PostGIS is required (used for nearest-church geospatial queries); the DB image is `postgis/postgis`.
- Metrics: both `server.ts` and `worker.ts` start a dedicated Prometheus endpoint via `src/metrics-server.ts`, toggled by `METRICS_ENABLED` (ports `METRICS_API_PORT`/`METRICS_WORKER_PORT`, default 9091/9092). On shutdown the metrics server is stopped **last** so telemetry stays available while the app drains; `stopMetricsServer` is a safe no-op if it never started.
- Observability stack (Prometheus/Grafana/Alertmanager, `fastify-metrics`/`prom-client`): the compose file is `docker-compose.monitoring.yml`, alert rules are `prometheus/alerts.yml`, dashboards are under `grafana/`, and the counters/gauges are declared in `src/infra/metrics/` (one module per area — `outbox-metrics.ts`, `email-metrics.ts`, `bullmq-metrics.ts`, `analytics-metrics.ts`, `lock-metrics.ts`). `scripts/verify-monitoring.sh` checks the stack end to end.
- Mail (`src/infra/mail/nodemailer-mail-sender.ts`): nodemailer runs **pooled** (`SMTP_POOL_*`), because the worker sends in batches and one connection per message makes a batch slow enough to outlive the job lock. Sending is wrapped in a cockatiel `SamplingBreaker` configured from its own `SMTP_CIRCUIT_BREAKER_*` vars — deliberately _not_ the `CIRCUIT_BREAKER_*` shared with the providers, whose traffic profile is nothing alike and whose kill switch would otherwise disable the mail breaker too. Opening the circuit also drops the cached transporter, since the pooled sockets of an SMTP that just failed in series are not worth keeping. Nothing is lost while the circuit is open: the failure reaches the mail worker, which turns it into a BullMQ retry, and the event stays in the outbox.
- Email templates are **React Email** (`src/infra/mail/templates/react/*.tsx`, shared `layout.tsx`), rendered with `@react-email/render` from the dispatch strategies. React escapes interpolation by construction, which is the security property the old raw template literals lacked — the rendering specs next to each strategy assert it, each paired with a counterweight so that over-escaping (which mangles accented Brazilian names) fails too. The plaintext part still comes from the `*-text.ts` templates. `knip.json` must keep following `.tsx` or the dead-code gate stops seeing these files.
- Deployment: `Dockerfile` (multi-stage; prod image only copies `@prisma/client`/`.prisma` from node_modules), `deploy.sh`, and PM2 `ecosystem.config.js` for the VPS target.
