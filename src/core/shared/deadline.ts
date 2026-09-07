import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'

/**
 * Abort reason attached when a deadline's own timer fires. A reason arriving
 * from a linked signal (a client disconnect, say) is forwarded untouched, so
 * logs can tell "we ran out of time" from "nobody is listening any more".
 */
export const DEADLINE_EXPIRED_REASON = 'DEADLINE_EXPIRED'

/**
 * Backs every {@link Deadline.none}. A single shared instance: it can never
 * fire, so there is nothing to keep per-deadline and nothing to leak — Node
 * holds `AbortSignal.any` sources weakly, so composing against it repeatedly
 * accumulates no listeners.
 */
const NEVER_ABORTS = new AbortController().signal

const NOOP = (): void => {}

/**
 * Node clamps any `setTimeout` delay above this to **1ms** (with only a
 * `TimeoutOverflowWarning` on stderr). Left unguarded, a budget of `Infinity`,
 * a `NaN` from a misparsed config value, or anything past ~24.8 days would
 * therefore abort on the very next tick — cancelling all work instantly while
 * `remainingMs()` still reported the full budget.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/**
 * A request-scoped time budget: how long is left, and the AbortSignal that
 * fires when it runs out.
 *
 * The point of the type is a single invariant, enforced by {@link derive}
 * taking a `min` and never a `max`:
 *
 *   **a derived deadline can never outlive the one it came from.**
 *
 * That makes "nested operations cannot exceed their parent timeout" structural
 * rather than a convention every call site has to remember. A layer that needs
 * a timeout does not invent one — it inherits a deadline and calls
 * `derive(itsOwnCap)`, receiving `min(what the parent has left, its own cap)`.
 *
 * Deadlines are cheap and immutable. `dispose()` releases the timer; it is
 * optional for correctness (timers are unref'd and cannot hold the process
 * open) but keeps long-lived parents from accumulating pending timers.
 */
export class Deadline {
  private constructor(
    /** Epoch milliseconds at which this deadline expires; `Infinity` if unbounded. */
    readonly expiresAt: number,
    readonly signal: AbortSignal,
    private readonly clearTimer: () => void,
  ) {}

  /**
   * Starts a fresh budget of `budgetMs`. A non-positive budget yields an
   * already-expired deadline rather than an error — callers check `expired`.
   *
   * `linkedTo` folds an external cancellation source (a client disconnect) into
   * the same signal, so consumers only ever watch one thing.
   */
  static in(budgetMs: number, options?: { linkedTo?: AbortSignal }): Deadline {
    return Deadline.until(Date.now() + Math.max(0, budgetMs), options?.linkedTo)
  }

  /**
   * A deadline that never expires, for callers with no budget to enforce —
   * workers, CLI entry points, and any layer invoked without one. Chosen over
   * `undefined` so downstream code has exactly one shape to handle.
   */
  static none(): Deadline {
    return new Deadline(Infinity, NEVER_ABORTS, NOOP)
  }

  private static until(expiresAt: number, linkedTo?: AbortSignal): Deadline {
    // A non-finite expiry is not a budget at all: `Infinity` from an explicit
    // "no timeout", or `NaN` from a misparsed config value. Arming a timer for
    // it would abort everything on the next tick, so treat it as unbounded —
    // while still honouring an external canceller if one was supplied.
    if (!Number.isFinite(expiresAt)) {
      return linkedTo ? new Deadline(Infinity, linkedTo, NOOP) : Deadline.none()
    }

    const controller = new AbortController()
    const delay = Math.min(Math.max(0, expiresAt - Date.now()), MAX_TIMER_DELAY_MS)
    const timer = setTimeout(() => {
      controller.abort(DEADLINE_EXPIRED_REASON)
    }, delay)

    // Never let a pending budget be the reason the process stays alive.
    timer.unref()

    const signal = linkedTo ? AbortSignal.any([controller.signal, linkedTo]) : controller.signal

    return new Deadline(expiresAt, signal, () => {
      clearTimeout(timer)
    })
  }

  /** Milliseconds left, floored at 0. `Infinity` for an unbounded deadline. */
  remainingMs(): number {
    return Math.max(0, this.expiresAt - Date.now())
  }

  /**
   * True once there is no time left, or the budget was cancelled from outside.
   *
   * Prefer this over reading `signal.aborted`: a zero-length budget is expired
   * immediately, while its timer can only fire on a later tick.
   */
  get expired(): boolean {
    return this.signal.aborted || this.remainingMs() <= 0
  }

  /**
   * A child budget of at most `maxMs`, expiring no later than this one.
   *
   * The child's signal fires on its own expiry *or* on the parent's, so
   * cancellation flows downwards through any depth of nesting.
   */
  derive(maxMs: number): Deadline {
    // A non-finite cap means "no cap of my own", never "no parent". Passing NaN
    // straight into Math.min would return NaN and hand back an *unbounded*
    // child of a bounded parent — the one way this class could break its own
    // invariant.
    const cap = Number.isFinite(maxMs) ? Math.max(0, maxMs) : Infinity
    const childExpiresAt = Math.min(this.expiresAt, Date.now() + cap)

    return Deadline.until(childExpiresAt, this.signal)
  }

  /**
   * The error to return when this deadline stopped the work.
   *
   * Any falsy reason — not just a missing one — falls back to the generic
   * marker: an abort carrying `''` or `0` says nothing a reader could act on,
   * and would otherwise surface as an error with a blank cause.
   */
  asError(): DeadlineExceededError {
    return new DeadlineExceededError(this.signal.reason || DEADLINE_EXPIRED_REASON)
  }

  /**
   * Releases the timer. Naturally idempotent — `clearTimeout` on an already
   * cleared handle is a no-op — and safe to call on an expired deadline.
   * Disposal is not cancellation: it never aborts the signal.
   */
  dispose(): void {
    this.clearTimer()
  }
}
