# SonarQube, static analysis hardening and the refactor it produced

Record of what was set up, what it found, what was changed, and — most
importantly — the places where a tool's advice was **rejected**, with the
reason. A silenced rule with no recorded reason is indistinguishable from a bug
someone gave up on.

---

## 1. What is now in place

| Piece | Where | Runs |
| --- | --- | --- |
| SonarQube 26.9 Community + its Postgres | `docker-compose.sonar.yml` | `npm run sonar:up` |
| Instance provisioning (profiles, rule params, quality gate) | `scripts/sonar-configure.mjs` | `npm run sonar:bootstrap` |
| Analysis inputs (coverage, test execution, ESLint) | `scripts/vitest-to-sonar.mjs`, `vite.config.mts` | `npm run sonar:reports` |
| Scan + gate enforcement + agent-readable report | `scripts/sonar.sh`, `scripts/sonar-report.mjs` | `npm run sonar:scan` |
| Consolidated security report (njsscan, Semgrep, Snyk Code, ESLint, Sonar) | `scripts/security-scan.sh`, `scripts/security-report.mjs` | `npm run security:scan` |
| Both wired into the pre-push gate | `scripts/ci-local.sh` | `npm run ci:local` |

`npm run sonar` does the whole sequence from a cold start.

### The quality gate

`Evangelismo Strict`, 14 conditions, provisioned from code so a wiped SonarQube
volume comes back identical. New-code conditions are what a pull request is
judged by; the overall ones stop debt that is never "new" from accumulating.

```
new_violations = 0            violations = 0
new_coverage >= 80            coverage >= 80
new_duplicated_lines <= 3%    duplicated_lines <= 3%
new_*_rating = A (x3)         *_rating = A (x3), security_review_rating = A
new_security_hotspots_reviewed = 100%
```

### Rule coverage

Every non-deprecated rule for `ts`, `js`, `secrets`, `docker` and `yaml` is
active — 519 TypeScript rules against Sonar way's 435. `statuses=READY` is the
one filter: SonarQube still ships rules it has itself deprecated, and enabling
those would police this source with advice its own vendor has withdrawn.

Thresholds are aligned with ESLint so a function cannot be legal in one tool and
illegal in the other: cognitive complexity 10, cyclomatic 6, function length 30,
parameters 5, nesting depth 3, file length 400.

### What the security report answers

`reports/security/SECURITY-REPORT.md` merges njsscan, Semgrep's security
rulesets, ESLint's security rules and SonarQube's security findings into one
list deduplicated by `file:line`, because read separately they are four partial
pictures with heavy overlap — the same `Math.random` was reported by three of
them under three different rule ids. Findings are fixed, or justified in
`security-suppressions.json` where the justification is reviewable in git. That
file is currently empty: the one false positive it briefly held (`sonarjs`
reading `PASSWORD_RESET_REQUESTED: 'PasswordResetRequested'` as a credential) is
now suppressed inline at the site instead, where the next reader of that line
sees the reasoning without going looking for it.

---

## 2. Results

| | Before | After |
| --- | --- | --- |
| SonarQube issues | 519 | **0** |
| ESLint findings (hardened config) | 288 | **0** |
| Reliability rating | D | **A** |
| Security rating | C | **A** |
| Maintainability rating | — | **A** |
| Security hotspots | 0 | 0 |
| Blocking security findings | 5 | **0** |
| Coverage (Sonar) | 81.8 % | **86.8 %** |
| Tests imported | 1300 | **1372** |
| Duplication (Sonar CPD) | 0.7 % | **0.0 %** |
| Duplication (jscpd, min-tokens 40) | 2.13 % | **1.25 %** |
| Technical debt (`sqale_index`) | 126 min | **0** |
| Technical debt ratio | — | **0.0 %** |

Measured on the `ci:local` run, which analyses the unit, cache-integration,
repository-integration and e2e projects together — the same allowlist CI uses.

---

## 3. Defects found and fixed

The scanners earned their place by finding things nobody suspected.

### D21 — the prototype chain was reachable through an error lookup

`deserializeAppError` resolved its factory with `AppErrorRegistry[type]`, and
`toHttpStatus` its status with `STATUS_MAP[type] ?? 500`. Both tables are plain
objects, so `type === 'constructor'` returned the `Object` function: truthy, so
`if (factory)` let it through and called it; non-null, so `?? 500` never fired
and `reply.code(fn)` threw inside the global error handler.

`type` is not a constant — it is a field of the JSON envelope the church-lookup
cache policy writes into Redis and reads back. Fixed with `safeLookup`
(`core/shared/safe-lookup.ts`), which asks `Object.hasOwn` first. Regression
test: `prototype-chain-reached-through-error-lookup.regression.spec.ts`, proven
red (8 failures on the pre-fix code, all six counterweights still green).

### The outbox pub/sub payload was dispatched unvalidated

`JSON.parse(message)` returns `any`, so `parsed.publicId` and `parsed.event`
went straight to a callback whose signature promises an `IOutboxEvent`. A
message from an older deploy — the test suite itself contained one — handed
`undefined` to a processor that dereferences it. Now narrowed by
`isOutboxSignalPayload`; two new tests cover the rejection path and were proven
red against the un-guarded code.

### Three lazy singletons cleared their state after awaiting

`closeAllRedisConnections`, `OutboxSignal.disconnect` and `stopMetricsServer`
all captured their targets, awaited the close, and *then* nulled the module
state. A `getRedisCache()` arriving during the await built a connection the
assignments immediately orphaned: never closed, not in `targets`, invisible to
the next shutdown. All three now detach before awaiting.

### `catch (err)` shadowed the `err` Result constructor

Three catch blocks in `resilient-cache.ts` bound `err`, shadowing the `err`
imported from `core/shared/result` in the same file. Any future `return err(...)`
inside one of them would have called the caught Error object. Renamed to
`error`.

### Cache TTL jitter used `Math.random`

Predictable expiry lets an attacker line requests up with it and force a
stampede. Replaced with `crypto.randomInt` over the same inclusive range. The
tests were rewritten to assert the *range requested* rather than reconstruct the
arithmetic, and the new assertion kills an off-by-one mutant the old one missed.

### Supply-chain exposure window

Semgrep flagged that neither npm nor Dependabot waited before adopting a newly
published version. Both now do (`min-release-age` in `.npmrc`, `cooldown` in
`dependabot.yml`): a week does not make a package trustworthy, but it puts the
public detection window in front of us instead of behind.

### A test whose assertion depended on the wall clock

`reset-password-use-case.spec.ts` set a token to expire **one second** in the
past and then asserted the use-case took its expired branch. The branch is
`tokenExpiresAt < new Date()`, so the assertion held only as long as the clock
did not move backwards between the two statements.

On this WSL2 host it does, under load: the very `ci:local` run that verified
this work printed `Tests + coverage: -76s`, and SonarQube's scanner logged
`Analysis total time: 0.-533 s`. A 76-second backwards jump makes a token that
expired "one second ago" read as still valid — the expired branch is skipped,
the real `updatePassword` consumes the failure the test injected for the
cleanup path, and the assertion fails with `InfraTestError` instead of
`InvalidTokenError`. That is precisely how it failed, once, in the Stop hook.

It did not reproduce in five isolated runs, so the diagnosis was built rather
than guessed: a probe confirmed a 76 s jump inverts a 1 s margin and leaves an
hour margin (its sibling test's) intact. Fixed by freezing time for that test —
`vi.useFakeTimers({ toFake: ['Date'] })`, Date only, because faking `setTimeout`
alongside bcrypt's async hashing hangs it — so the test consults no host clock
at all and no jump is observable.

### Dead code

`src/templates/contact-user/teste.html` — unreferenced, deleted. Confirmed by
Knip, whose sensitivity was itself verified by planting a dead export and a dead
file and watching it fail.

---

## 3b. Deep refactor — beyond what the tools flagged

A second pass looked for problems no gate reports, under a hard constraint:
**test files were frozen**, so every change had to be behaviour-preserving as
judged by specs nobody was allowed to touch. That constraint is also what makes
the results trustworthy — 1 771 unmodified tests are the proof.

### The same 150-line algorithm, written twice

`ResilientAddressProvider` and `ResilientGeoProvider` were structurally
identical: same budget check before each attempt, same latency timer and request
metric, same NOT_FOUND / RETRYABLE / fatal routing, same tally, same exhaustion
decision. SonarQube's duplication detector scored the project at 0.7 % and never
flagged it, because the type names and the Portuguese log strings differ enough
token-by-token to defeat token-level CPD.

That is the duplication that actually costs something: a fix applied to one
chain and not the other is invisible until the two behave differently in
production.

Extracted to `providers/helpers/provider-chain.ts`. The two classes went from
185 and 189 lines to 100 each; the algorithm now exists once. What stayed behind
is what genuinely differs — CEP normalisation, the error each raises when every
provider says "not found", and the wording of the logs, which the specs pin
exactly. Duplication fell to **0.3 %**.

*Found by reading the two files side by side, not by a script.* A structural
similarity scan run afterwards reported nothing further, but its sensitivity
could not be validated, so that "nothing further" is weaker evidence than it
looks.

### Architecture boundaries

Three inward-pointing dependencies were inverted:

- `errors/mappings/find-nearest-churches-error-mapper.ts` and the Stadia routing
  provider imported `@http/http-status` to describe **upstream** status codes.
  `429` there means "ViaCEP is throttling us", not "we are throttling a client";
  reusing the response-side constants made inner layers depend on the HTTP layer
  to talk about someone else's behaviour. Now `core/constants/upstream-http-status.ts`.
  Both leaks were introduced earlier in this same work — the boundary scan is
  what caught them.
- `AuthenticateUserUseCase` and `ForgotPasswordUseCase` imported `emailSchema`
  from `@http/schemas`. Deciding whether a login string is an address is a
  domain question, not a transport one. Now `core/validation/email.ts`, which
  the HTTP schemas import too — outer depending on inner, as intended.

**One violation was left in place**, deliberately:
`FindNearestChurchesUseCase` imports `ChurchPresenter` from `@http/presenters`
and returns HTTP-shaped data. Fixing it means moving presentation to the
controller and changing the use-case's return type — and
`find-nearest-churches-orchestration-use-case.spec.ts` imports `ChurchPresenter`
directly and asserts that shape. Under a test freeze it cannot be done honestly.
It needs the presenter call moved to the controller, the use-case returning
domain objects, and that spec updated in the same commit.

### The hottest module

`resilient-cache.ts` was 602 lines doing nine jobs. The most separable — *what a
failure means, whether it is worth remembering, how it is stored and rebuilt* —
became `cache-failure-policy.ts`. It is the part with the sharpest consequences
(a wrong answer pins an unrelated outage to a good key for the whole negative
TTL) and the part a reader most often needs in isolation.

### What was checked and found already clean

Reported rather than "improved", because inventing work here would be worse than
none:

- **No swallowed errors.** Ten `catch` blocks initially looked unhandled; all
  ten were false positives of an 8-line scan window — each logs, rethrows,
  returns a `Result`, or delegates to a named mapper.
- **The Result convention holds.** The only two `throw`s in use-cases and
  repositories are the transactional decorator's deliberate rollback signal,
  immediately converted back to a `Result`.
- **Every `Deadline` is disposed** in the file that creates it.

---

## 3c. Snyk, and the duplication I had missed

### Snyk is installed and running — partly

`snyk@1.1307.0`, credential in `.env.security` (gitignored, 0600). Two products
were wired; one runs today:

| Product | State | Note |
| --- | --- | --- |
| Snyk Open Source (SCA) | **running, gating** | Different advisory DB from OSV-Scanner |
| Snyk Code (SAST/taint) | **not enabled** | `SNYK-CODE-0005` / 403 — org entitlement |

Snyk Code needs enabling in the Snyk web console (Settings → Snyk Code); the v1
API endpoint for it returns 404 and the CLI cannot toggle it. Until then the
stage skips and the report lists it as **not run** rather than clean — a report
that certifies a scan which never happened is worse than a red pipeline.

**Snyk earned its place on the first run.** It reported `fast-uri@3.1.6`
CVE-2026-84292 (improper escaping) and CVE-2026-84394 (host confusion), reached
through Fastify — advisories **OSV-Scanner did not report**. Overlapping
scanners are not redundant when their databases differ.

Two things had to be got right before believing it:

- **`--all-projects` is wrong here.** It walks every `package-lock.json` in the
  tree, including the `.stryker-tmp` mutation sandboxes — throwaway copies
  pinned to whatever the dependencies were when the last mutation run started.
  They produced 102 findings against versions the project no longer uses. The
  scan is now root-only, the same way the Trivy stage already skips that
  directory.
- **The fix was verified, not assumed.** Overriding `fast-uri` to 3.1.7 and
  re-scanning left the advisories in the report, which looked like the upgrade
  had failed. It had not — the residue was sandbox noise. Pinning the root to
  3.1.6 gives **4 findings**; 3.1.7 gives **0**. That comparison, not the
  version number, is the evidence.

### The supply-chain cooldown blocked its own security fix

`fast-uri@3.1.7` was 5.2 days old and `min-release-age=7` refused to resolve it:
the policy that exists to avoid unknown fresh releases was delaying a published
remedy for a known CVE. Installed with a one-off `--min-release-age=0`, which is
safe because the lockfile then pins the exact version and `npm ci` never
re-resolves. The policy stays at 7 for everything else.

*(That same setting had a real bug: it is measured in **days**, not minutes. Set
to `10080` — 7 days in minutes — it became a 27-year cutoff that silently broke
`npm install <anything-new>` while every existing command kept working, because
the lockfile pins resolved versions. Corrected to `7`.)*

### My duplication scan was wrong, and now there is a real one

The earlier hand-rolled similarity scan reported "nothing further". That was
**incorrect**. `jscpd`, validated first against the duplication already known
and fixed — it scores the pre-refactor provider chains at **5 clones / 80 lines
/ 21.4 %**, so it is demonstrably sensitive to that class — found **30 clones,
282 duplicated lines (2.13 %)** across the tree the heuristic called clean.

Two were worth fixing:

- **The two e-mail strategies** shared 44 lines across three clones, including
  byte-identical `getStringField` / `getOptionalStringField` helpers. Extracted
  to `form-payload-fields.ts`. What remains between them is import lists and the
  shape of implementing the same interface — extracting *that* would mean a base
  class, trading real coupling for a cosmetic metric, so it was left.
- **`toSessionAttributes` + `OPTIONAL_SESSION_FIELDS`** existed byte-identically
  in the Prisma analytics repository and its in-memory double — and the double's
  own comment said why that was dangerous: *"A divergence here would make a unit
  test agree with a production path that does something else."* Now singular in
  `core/projections/`. The doubles stay independent where it matters (storage
  semantics) while agreeing on the field list by construction.

Duplication: **2.13 % → 1.69 %**.

`jscpd` is now a gate — `npm run check:duplication`, in `ci:static` and in CI,
threshold 3 % in `.jscpd.json`. Proven to bite: at threshold 1 it exits 1.

---

## 3d. Closing the backlog

### nodemailer v7 → v9, tested

The six baselined advisories (SSRF, CRLF injection, improper certificate
validation, missing authorization) are **gone** — not filtered, gone: OSV run
*without* `--config` reports "No issues found", and Snyk reports
`Tested 185 dependencies for known issues, no vulnerable paths found`.

The blocker recorded earlier — "no `@types/nodemailer` release matching v9" —
was real but not fatal. v9 still ships no bundled types, and `@types/nodemailer`
stops at 8.0.1; that version types the SMTP surface this codebase actually uses
(`createTransport`, `verify`, `sendMail`, `Transporter<SentMessageInfo>`,
`SMTPTransport.SentMessageInfo`, `Attachment`), which did not change across the
major. Typecheck is clean.

Verified rather than assumed, in this order: typecheck → lint → **1 771 unit
tests** → acceptance, e2e, both CI integration projects → **the opt-in
`integration` suite (63 tests), which drives the real mail worker with SMTP
stubbed at the client boundary** → Docker build and smoke test. Zero test files
were modified.

`9.0.6` and not `9.1.1`: the newer patch is 6 days old and `min-release-age=7`
blocks it. 9.0.6 is 11 days old and clears the cooldown on its own — no
exception needed, unlike the `fast-uri` fix.

Both exemption lists were then **emptied of nodemailer**:
`osv-scanner.toml` went from 7 baselines to 1, and
`security-suppressions.json` back to `[]`. A stale exemption for a fixed
vulnerability is worse than none — it trains the next reader to skim the list.

### The remaining duplication

`2.13 % → 1.25 %`, 30 clones → 21, in four extractions:

| Extracted | Removed |
| --- | --- |
| `providers/helpers/guarded-attempt.ts` | ~31 lines across the three provider decorators |
| `providers/helpers/provider-http-client.ts` | ~28 lines across five raw providers |
| `lib/infra/distributed-lock/with-distributed-lock.ts` | ~25 lines across the two outbox jobs |
| `use-cases/forms/strategies/form-payload-fields.ts` | ~44 lines across the two e-mail strategies |

The provider HTTP client is the clearest case of duplication that had stopped
meaning anything: every provider mapped its own `HTTPS_AGENT` config into axios
agent options field by field, and every one of those configs was literally
`SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT` — five copies of a mapping from one
shared value to itself.

The distributed lock is the one with teeth: `OutboxProcessor` and
`OutboxMaintenance` each had their own acquire/renew/release, differing by a
single line. A lock is not a thing to have two slightly different
implementations of — a missing `finally` in one strands the key until its TTL
expires and stalls the outbox for that long.

**What remains, and why it is being left:** the 21 clones still reported are
import lists, the shape of implementing a shared interface, and two controllers
whose branches genuinely repeat a four-line guard. Removing them means base
classes and indirection that would cost more in readability than the metric is
worth. All are well inside the 3 % gate.

---

## 4. Advice that was rejected, and why

Every entry here is a rule that was switched off or scoped. They are the
interesting half of this document.

### Deactivated repo-wide (`scripts/sonar-configure.mjs`)

| Rule | Findings | Why not |
| --- | --- | --- |
| `S3524` arrow parens | 100 | Exactly contradicts Prettier's `arrowParens: "always"`. Keeping both makes the formatter undo the fix on every save. |
| `S1774` no ternaries | 94 | Bans *all* ternaries. Converting one-line `isDev ? a : b` to if/else raises the cyclomatic complexity that `S1541` measures — the two rules contradict each other. |
| `S121` braces on every `if` | 34 | Conflicts with the Result-pattern guard (`if (isErr(result)) return result`) that CLAUDE.md documents as the core idiom. Braces would double the line count of every guard and clarify none. |
| `S4326` redundant `await` on return | 27 | Same call as ESLint's `return-await: error-handling-correctness-only`. Removing those awaits moves microtask boundaries in working code, and this repo has already lost single-flight deduplication to exactly that. The real defect — a promise returned from inside `try` — is still caught. |
| `S2138` prefer `null` over `undefined` | 2 | Contradicts an explicit boundary decision: domain contracts declare `Date \| undefined` and the Prisma repository converts (`raw.sendingAt \|\| undefined`). `null` is the database's vocabulary, `undefined` the domain's. |
| `S1451` copyright header | — | The project uses a root `LICENSE.txt`. |
| `S1226` no parameter reassignment | — | Covered, and better calibrated, by ESLint's `no-param-reassign` (which permits property mutation). |

### Scoped to a path (`sonar-project.properties`)

- **S109 magic numbers in `src/env/index.ts`** — every literal there *is* the
  definition of a default (`.default(9091)`, `.default(12)`). Naming them adds a
  constant that says the same word twice.
- **S109 in `src/lib/metrics/**`** — the numbers are histogram bucket
  boundaries, a measurement scale; naming each hides the shape of the scale.
- **S2187 "add tests or delete"** on `*.contract.spec.ts`,
  `*.integration.spec.ts`, `*.acceptance.spec.mts` — the tests exist and run
  (they are in the imported execution report); Sonar's parser cannot see a
  `describe` that an imported helper registers.
- **S138 function length in `src/templates/**`** — those bodies are one HTML
  string literal with no branching, so the rule measures markup. Same reason
  ESLint exempts them.
- **S6564 redundant alias** on `distributed-lock.ts` — `LockToken = string`
  names the one string in `renew(key: string, token: LockToken)` that is a proof
  of ownership rather than an identifier, across nine signatures.
- **S3801 inconsistent returns in `src/http/**`** — `return reply` is Fastify's
  documented way for an async hook to halt the request lifecycle. The
  inconsistency *is* the framework contract.
- **S100 function naming in `app-error-registry.ts`** — its keys are the class
  names of the errors they rebuild, because `serializeAppError` writes
  `err.constructor.name` and the registry is looked up by that exact string.
- **S3003 string comparison in `stable-order.ts`** — see below.

### Rule parameters retuned rather than disabled

- **S100 format** widened to `^([_a-z][a-zA-Z0-9]*|[A-Z][A-Z0-9_]*)$` so the
  Prisma error-code tables (`P2002: …`) pass while camelCase stays enforced.
- **S4622 union size** raised 3 → 6: a recursive JSON payload type and a
  four-overload implementation signature both legitimately need more.

### ESLint rules turned off (`eslint.config.mjs`)

| Rule | Findings | Why not |
| --- | --- | --- |
| `security/detect-object-injection` | 30 | 28 were provably safe (`params[k]` over `Object.keys(params)`, `logger[level]` over a string-literal union). The two that were real are fixed with `safeLookup` — a better outcome than 28 permanent suppressions. |
| `sonarjs/todo-tag` | 2 | Comments here are Portuguese, where "todo" means "every". It fires on prose like *"em todo log de erro"*. SonarQube's own S1135 implements the check without that false positive and stays active. |
| `sonarjs/function-return-type` | 3 | Fires on a TypeScript overload's implementation signature. The rule is written for untyped JavaScript; here the overloads are what makes the union safe. |
| `promise-function-async` | 26 | Would rewrite pass-through functions (`return this.prisma.user.findUnique(...)`) into async wrappers, each adding a tick for no behavioural gain. |
| `restrict-template-expressions` `allowNumber` | 20 | `${port}` in a log line is not a defect. The cases the rule exists for — an object stringifying to `[object Object]`, a possibly-undefined value printing as `"undefined"` — are still reported, and one such case was found and fixed in `server.ts`. |

### Two places where the advice would have introduced a bug

**`Array.prototype.sort()` without a comparator (S2871).** Both findings sort
object keys to build a *cache key* — the HTTPS agent pool key and the Redis
cache key. Sonar suggests `localeCompare`, which orders by the runtime's
collation: a container that came up with a different locale would hash the same
parameters into a different key, silently splitting the cache in half. Fixed
with an explicit code-unit comparator (`core/shared/stable-order.ts`) whose
docblock records this, and S3003 is scoped off *for that file* because comparing
strings by code unit is the entire point of it.

**`request.routeOptions` is always defined.** Three optional chains looked
redundant against Fastify's types. Removing them broke five tests: a request
that matched no route — a 404 — carries no `routeOptions`, and the plugins run
for those too. Restored, with the reason and the covering specs named inline.

### `noUncheckedIndexedAccess` — measured and declined

It is the canonical TypeScript-strictness flag and would have legitimised about
six of the "unnecessary condition" guards. Enabling it produced **207 errors,
roughly 70 % of them in spec files** doing `mock.calls[0][0]`, where the access
is provably safe and the fix is a `!` that throws less helpfully than the
assertion it replaces. Declined, and the same guards were made honest more
precisely instead: `.at()` where an index may be out of range, `| undefined` on
the axios response generics, an optional `role` on the decoded JWT payload.

---

## 5. Type-honesty changes worth calling out

Several "unnecessary condition" findings were symptoms of a type that claimed
more than the runtime guarantees. Fixing the type, rather than deleting the
guard, is what turned them into checks the compiler agrees are needed:

- **axios response generics** now carry `| undefined`. Axios types
  `response.data` as the generic regardless of what the server sent, so a 204,
  an empty body or a proxy error page all arrived typed as a valid payload.
- **the decoded JWT payload** declares `role?: UserRole`. It is a token *we
  received*, not a value this process built; declaring `role` as always present
  made the authorisation guard in `verify-user-role.middleware` look redundant
  while being the only thing enforcing it.
- **`SentMessageInfo`** now resolves to `SMTPTransport.SentMessageInfo` instead
  of nodemailer's top-level `export type SentMessageInfo = any`, which was
  disabling type checking from the mail sender outwards.
- **the Nominatim search response** is typed at all — it was an untyped
  `api.get()`, so `.length`, `[0]`, `.lat` and `.lon` were unchecked reads.
- **`array[i]` → `array.at(i)`** wherever the guard that follows is real.

---

## 6. Named constants introduced

`src/http/http-status.ts`, `src/core/constants/geo.ts`,
`src/core/constants/time.ts`, `src/core/constants/pagination.ts`,
`src/http/schemas/validation-limits.ts`.

The pagination one is the load-bearing case: the users page size was the literal
`20` written out in both `PrismaUsersRepository` and `InMemoryUsersRepository`.
Two copies of a page size is one edit away from a double that pages differently
from the database it stands in for — and the shared repository contract would
have kept passing, because both sides would still have been internally
consistent.

---

## 7. Operating it

```bash
npm run sonar            # cold start: up + bootstrap + reports + scan
npm run sonar:up         # start the stack (~2 min from a cold volume)
npm run sonar:scan       # scan using the reports already on disk
npm run sonar:report     # re-read the last analysis without re-scanning
npm run sonar:reset      # wipe the volumes; the next run re-provisions from code
npm run security:scan    # the four-tool consolidated security report
```

State lives in `.sonar/` (gitignored, `0600`): a randomly generated admin
password replacing the default `admin/admin` on first boot, and an analysis
token. Nothing is committed.

### Two things worth knowing before reading a report

**"Missing blame information for N files."** The report surfaces this Compute
Engine warning rather than leaving it in the scanner log, because it silently
degrades the new-code half of the gate: SonarQube decides what is "new" from git
blame, and an uncommitted working tree has none. It resolves itself once the
changes are committed — but a run against a dirty tree is judging everything as
new, and should be read that way.

**The e2e and integration projects only count when the whole pipeline runs.**
`npm run sonar:reports` runs the unit projects alone (~82 % coverage); the
`ci:local` stage reuses the full allowlist (~87 %). Neither number is wrong;
they measure different runs, and a drop between them usually means the stack was
down rather than that coverage regressed.

**SonarQube is a pre-push gate, not a CI job.** It needs its own Postgres and an
Elasticsearch heap, takes minutes to boot from a cold volume, and keeps the
issue history that makes the "new code" half of the gate mean anything — none of
which survives a fresh GitHub runner. The security consolidation, which needs no
server, *is* mirrored in CI as the `security-code` job.
