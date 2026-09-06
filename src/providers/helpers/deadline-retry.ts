import { Deadline } from 'core/shared/deadline'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FindNearestChurchesErrorMapper } from 'errors/mappings/find-nearest-churches-error-mapper'
import { logger } from '@lib/logger'
import {
  retry,
  wrap,
  handleWhen,
  DelegateBackoff,
  decorrelatedJitterGenerator,
  BrokenCircuitError,
  IRetryBackoffContext,
} from 'cockatiel'
import { getProviderCircuitBreaker } from './provider-circuit-breaker'
import { isRetryableFailure } from './retryable-failure'
import { CircuitOpenError } from 'errors/infrastructure/circuit-open-error'

/**
 * Below this much remaining budget an attempt is not worth starting: the
 * request would be aborted before any provider could answer, while still
 * costing a rate-limit point and a socket.
 */
const MIN_ATTEMPT_BUDGET_MS = 50

/** Opaque state threaded through cockatiel's decorrelated-jitter generator. */
type JitterState = [number, number]

/** Mutable attempt tally, so the final log can name the attempt that failed. */
interface AttemptCounter {
  attempts: number
}

export interface RunWithRetriesParams<T> {
  /** The budget this whole retry sequence must fit inside. */
  deadline: Deadline
  providerName: string
  /**
   * Total attempts, not retries *after* the first — matching the existing
   * `IRaw*Provider.maxRetries` semantics, where 2 means two calls.
   */
  maxAttempts: number
  backoffMs: number
  /** This provider's own per-call ceiling; narrowed by the remaining budget. */
  attemptTimeoutMs: number
  logContext?: Record<string, unknown>
  action: (attemptDeadline: Deadline) => Promise<T>
}

/**
 * Runs one provider call with retries, jittered backoff and error mapping, all
 * bounded by a parent {@link Deadline}.
 *
 * The attempt loop and the backoff schedule come from cockatiel; the *budget*
 * stays ours. Every timeout here is still derived rather than invented: an
 * attempt gets `min(attemptTimeoutMs, remaining budget)`, and a backoff can
 * never extend past the deadline.
 *
 * Two cockatiel behaviours are compensated for deliberately, both verified in
 * `cockatiel-policy-contract.spec.ts`:
 *
 * 1. Its `maxAttempts` counts retries *after* the first call, so it receives
 *    `maxAttempts - 1` to keep our "2 means two calls" contract.
 * 2. A backoff delay already in flight is not cancellable — cockatiel checks
 *    the signal only *before* sleeping, then calls the action once more. The
 *    delegate below caps every delay at the remaining budget, and the budget
 *    guard in {@link attemptOnce} turns that extra call into an immediate
 *    ABORTED failure instead of another request to the provider.
 */
export async function runWithRetries<T>(params: RunWithRetriesParams<T>): Promise<Result<T, AppError>> {
  // Floor at one: a misconfigured 0 would otherwise skip the provider entirely
  // and report it as busy, which reads in production like an outage rather than
  // like the configuration mistake it is.
  const maxAttempts = Math.max(1, params.maxAttempts)
  const counter: AttemptCounter = { attempts: 0 }

  // `dangerouslyUnref` keeps a pending retry timer from holding the event loop
  // open during shutdown, matching the convention Deadline already follows.
  const attemptsPolicy = retry(handleWhen(isRetryableFailure), {
    maxAttempts: maxAttempts - 1,
    backoff: budgetedBackoff(params, maxAttempts),
  }).dangerouslyUnref()

  // Retry outermost, breaker inside: once a provider's circuit opens, the
  // remaining attempts are rejected instantly instead of each one waiting on an
  // upstream we already know is unhealthy.
  const breaker = getProviderCircuitBreaker(params.providerName)
  const policy = breaker ? wrap(attemptsPolicy, breaker) : attemptsPolicy

  try {
    const attempts = policy.execute(() => attemptOnce(params, counter), params.deadline.signal)
    return ok(await settleFirst(attempts, params.deadline))
  } catch (error) {
    return err(finalize(error, params, counter))
  }
}

/**
 * Resolves with the retry sequence, or rejects the moment the deadline is
 * cancelled — whichever comes first.
 *
 * cockatiel inspects the signal only *before* each backoff and then awaits the
 * delay uninterruptibly, so a caller that disconnects mid-backoff would
 * otherwise be held for the remainder of that delay. Clamping the delay to the
 * remaining budget bounds the wait for a budget that simply runs out, but an
 * *external* abort can arrive long before that, which is why the race is here
 * as well.
 *
 * The abandoned sequence keeps its rejection handled: when its delay finally
 * ends, the next attempt finds the budget spent and fails without ever
 * reaching the provider.
 */
function settleFirst<T>(work: Promise<T>, deadline: Deadline): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(deadline.asError())

    deadline.signal.addEventListener('abort', onAbort, { once: true })

    work.then(resolve, reject).finally(() => {
      deadline.signal.removeEventListener('abort', onAbort)
    })
  })
}

/** One call, under a deadline that can only be narrower than its parent's. */
async function attemptOnce<T>(params: RunWithRetriesParams<T>, counter: AttemptCounter): Promise<T> {
  if (!hasBudgetForAttempt(params.deadline)) {
    throw params.deadline.asError()
  }

  counter.attempts += 1
  const attemptDeadline = params.deadline.derive(params.attemptTimeoutMs)

  try {
    return await params.action(attemptDeadline)
  } catch (error) {
    throw classifyFailure(error, params.deadline)
  } finally {
    attemptDeadline.dispose()
  }
}

/**
 * Exponential backoff with decorrelated jitter, clamped to what is left of the
 * budget.
 *
 * The jitter is the reason for moving to a library at all: the previous fixed
 * `backoffMs * 2^(n-1)` schedule made every client retry a failing provider in
 * lockstep, concentrating load exactly when it was recovering. `maxDelay` is
 * pinned to the largest step that old schedule would have taken, so the jitter
 * varies *within* the previous envelope rather than extending it.
 *
 * That ceiling is a guard rather than a working limit: decorrelated jitter grows
 * roughly as `2^n / 1.4`, so it stays below `2^(n-1)` and never actually reaches
 * the cap for these attempt counts. Mutating the exponent therefore survives
 * mutation testing as an equivalent mutant — the bound is deliberately slack, and
 * the real bound on any single delay is the remaining budget clamped below.
 */
function budgetedBackoff<T>(params: RunWithRetriesParams<T>, maxAttempts: number) {
  const options = {
    generator: decorrelatedJitterGenerator,
    initialDelay: params.backoffMs,
    exponent: 2,
    maxDelay: params.backoffMs * 2 ** Math.max(0, maxAttempts - 1),
  }

  return new DelegateBackoff<IRetryBackoffContext<unknown>, JitterState>((context, state) => {
    const [raw, nextState] = decorrelatedJitterGenerator(state, options)
    const delay = Math.max(0, Math.min(raw, params.deadline.remainingMs()))

    logRetry(params, context.attempt, delay)

    return { delay, state: nextState }
  })
}

/**
 * A spent parent budget outranks whatever the attempt actually threw.
 *
 * The distinction matters to the fallback chains: a per-attempt timeout is
 * RETRYABLE, so the chain moves on to the next provider, whereas an exhausted
 * budget is ABORTED and terminal — there is no time left to hear any answer, so
 * asking the remaining providers only burns their rate-limit quota.
 */
function classifyFailure(error: unknown, deadline: Deadline): AppError {
  if (deadline.expired) {
    return deadline.asError()
  }

  return FindNearestChurchesErrorMapper.map(error)
}

function hasBudgetForAttempt(deadline: Deadline): boolean {
  return !deadline.expired && deadline.remainingMs() >= MIN_ATTEMPT_BUDGET_MS
}

/**
 * Translates whatever escaped the policy into an AppError, logging it only when
 * a provider was actually called — a budget that was already spent on arrival
 * says nothing about the provider and would be noise in its error log.
 */
function finalize<T>(error: unknown, params: RunWithRetriesParams<T>, counter: AttemptCounter): AppError {
  const appError = toAppError(error, params.providerName)

  if (counter.attempts > 0) {
    logExhausted(params, counter.attempts, appError)
  }

  return appError
}

/**
 * A tripped breaker is named here rather than in the shared mapper because only
 * this layer knows *which* provider refused the call; the mapper would have to
 * label it "Unknown Provider".
 */
function toAppError(error: unknown, providerName: string): AppError {
  if (error instanceof BrokenCircuitError) {
    return new CircuitOpenError(providerName, error)
  }

  return error instanceof AppError ? error : FindNearestChurchesErrorMapper.map(error)
}

function logRetry<T>(params: RunWithRetriesParams<T>, attempt: number, delay: number): void {
  logger.warn({ ...params.logContext, attempt, delay }, `Repetindo solicitação para ${params.providerName}`)
}

function logExhausted<T>(params: RunWithRetriesParams<T>, attempt: number, error: AppError): void {
  logger.error({ ...params.logContext, attempt, error }, `Falha ao consultar ${params.providerName} após tentativas`)
}
