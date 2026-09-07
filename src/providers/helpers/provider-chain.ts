import { Deadline } from 'core/shared/deadline'
import { Result, ok, err, isOk } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import {
  collectMetricsProviderLatency,
  collectMetricsProviderFallback,
  collectMetricsProviderChainExhausted,
  recordProviderRequest,
  ProviderMetricLayer,
} from '@lib/metrics/provider-metrics'

/**
 * The fallback algorithm shared by every resilient provider chain.
 *
 * `ResilientAddressProvider` and `ResilientGeoProvider` were the same ~150
 * lines twice over: the same budget check before each attempt, the same latency
 * timer and request metric, the same NOT_FOUND / RETRYABLE / fatal routing, the
 * same tally, the same exhaustion decision. SonarQube's duplication detector
 * missed it because the type names and the Portuguese log strings differ enough
 * token-by-token — which is exactly the kind of duplication that drifts: a fix
 * applied to one chain and not the other is invisible until the two behave
 * differently in production.
 *
 * Routing is driven purely by `error.failureMode`; no `instanceof` anywhere.
 */

/** What the chain has learned so far while walking its providers. */
interface ChainTally {
  notFoundCount: number
  lastRetryableError?: AppError
  lastProviderName?: string
}

/**
 * How a chain narrates itself.
 *
 * Logging is the one thing the two chains genuinely do differently — different
 * messages, and the address chain carries the CEP through three of them — so it
 * is the part they keep. The algorithm above is identical and lives here once;
 * each chain supplies its own voice.
 */
export interface ProviderChainNarrator {
  success(providerName: string): void
  emptyResult(providerName: string): void
  notFound(providerName: string): void
  retryable(providerName: string, attempt: number, error: AppError): void
  fatal(providerName: string, error: AppError): void
  allNotFound(notFoundCount: number, totalProviders: number): void
  systemFailure(providerName: string | undefined, notFoundCount: number, error: AppError): void
}

export interface ProviderChainRun<TProvider extends object, TValue> {
  providers: readonly TProvider[]
  deadline: Deadline
  /** Metric label. Typed, not a bare string, so a new chain cannot invent a
   *  label the metric definitions do not declare. */
  layer: ProviderMetricLayer
  narrator: ProviderChainNarrator
  /** Raised when every provider agreed the resource does not exist. */
  allNotFoundError: () => AppError
  attempt: (provider: TProvider, deadline: Deadline) => Promise<Result<TValue | null, AppError>>
}

/**
 * A provider's own name when it declares one, its class name otherwise.
 *
 * The decorators set `providerName`; the raw providers and test doubles do not
 * always, and a metric labelled `undefined` is worse than one labelled with a
 * class name.
 */
function providerNameOf(provider: object): string {
  return (provider as { providerName?: string }).providerName ?? provider.constructor.name
}

export async function runProviderChain<TProvider extends object, TValue>(
  run: ProviderChainRun<TProvider, TValue>,
): Promise<Result<TValue | null, AppError>> {
  const tally: ChainTally = { notFoundCount: 0 }

  for (const [index, provider] of run.providers.entries()) {
    // Honour the budget before each provider attempt: with none left, every
    // remaining provider would fail instantly while still costing quota.
    if (run.deadline.expired) {
      return err(run.deadline.asError())
    }

    const providerName = providerNameOf(provider)
    const result = await callProvider(run, provider, providerName)
    const terminal = interpret(run, result, providerName, index, tally)

    if (terminal) {
      return terminal
    }
  }

  return decideExhausted(run, tally)
}

async function callProvider<TProvider extends object, TValue>(
  run: ProviderChainRun<TProvider, TValue>,
  provider: TProvider,
  providerName: string,
): Promise<Result<TValue | null, AppError>> {
  const endTimer = collectMetricsProviderLatency?.startTimer({ provider: providerName, layer: run.layer })
  const result = await run.attempt(provider, run.deadline)
  endTimer?.()

  recordProviderRequest(run.layer, providerName, result)

  return result
}

/**
 * Turns one provider's outcome into either a terminal result for the whole
 * chain, or `null` meaning "keep going" — recording what we learned in `tally`.
 */
function interpret<TProvider extends object, TValue>(
  run: ProviderChainRun<TProvider, TValue>,
  result: Result<TValue | null, AppError>,
  providerName: string,
  index: number,
  tally: ChainTally,
): Result<TValue | null, AppError> | null {
  if (isOk(result)) {
    return interpretSuccess(run, result.value, providerName, tally)
  }

  const error = result.error

  // NOT_FOUND: resource genuinely missing — treat same as null response
  if (error.failureMode === FailureMode.NOT_FOUND) {
    tally.notFoundCount++
    run.narrator.notFound(providerName)
    return null
  }

  // RETRYABLE: transient infra error — log and advance to next provider
  if (error.failureMode === FailureMode.RETRYABLE) {
    noteRetryable(run, error, providerName, index, tally)
    return null
  }

  // PERMANENT / ABORTED / untagged — bail without trying other providers
  run.narrator.fatal(providerName, error)
  return err(error)
}

function interpretSuccess<TProvider extends object, TValue>(
  run: ProviderChainRun<TProvider, TValue>,
  value: TValue | null,
  providerName: string,
  tally: ChainTally,
): Result<TValue | null, AppError> | null {
  if (value === null) {
    tally.notFoundCount++
    run.narrator.emptyResult(providerName)
    return null
  }

  run.narrator.success(providerName)
  return ok(value)
}

function noteRetryable<TProvider extends object, TValue>(
  run: ProviderChainRun<TProvider, TValue>,
  error: AppError,
  providerName: string,
  index: number,
  tally: ChainTally,
): void {
  tally.lastRetryableError = error
  tally.lastProviderName = providerName

  // `.at()`, not `[index + 1]`: an index signature promises an element at every
  // index, so the guard below read as dead while being the only thing stopping
  // a fallback metric from naming `undefined` on the last provider.
  const nextProvider = run.providers.at(index + 1)
  if (nextProvider) {
    collectMetricsProviderFallback?.inc({
      layer: run.layer,
      from_provider: providerName,
      to_provider: providerNameOf(nextProvider),
    })
  }

  run.narrator.retryable(providerName, index + 1, error)
}

/** Every provider was asked and none answered. */
function decideExhausted<TProvider extends object, TValue>(
  run: ProviderChainRun<TProvider, TValue>,
  tally: ChainTally,
): Result<TValue | null, AppError> {
  if (tally.notFoundCount === run.providers.length) {
    run.narrator.allNotFound(tally.notFoundCount, run.providers.length)
    return err(run.allNotFoundError())
  }

  collectMetricsProviderChainExhausted?.inc({ layer: run.layer })

  if (tally.lastRetryableError) {
    run.narrator.systemFailure(tally.lastProviderName, tally.notFoundCount, tally.lastRetryableError)
    return err(tally.lastRetryableError)
  }

  return err(new ProviderFailureError(new Error('TODOS os provedores falharam')))
}
