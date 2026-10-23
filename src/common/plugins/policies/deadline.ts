/**
 * Per-route request budgets, in milliseconds.
 *
 * A route that names one here gets a {@link Deadline} at the HTTP boundary, and
 * every layer below derives its own timeout from what is left of it. A route
 * that names none gets an unbounded deadline, so opting in is explicit and no
 * existing endpoint changes behaviour by accident.
 *
 * These are ceilings on *client-visible* latency, not targets. Sizing rule: the
 * budget must exceed the happy path with room for jitter, and be short enough
 * that a degraded upstream fails fast instead of holding a connection open.
 */
export const HTTP_DEADLINE_POLICIES = {
  churches: {
    /**
     * The cold happy path is two sequential external calls (an address provider
     * at ~2s, then the Stadia matrix at ~3s) plus a PostGIS KNN, so 8s clears it
     * with margin. It replaces an effective ceiling of ~17s — the old 15s cache
     * budget plus an unbounded Redis read and write at either end — which is far
     * past any sane client timeout for a synchronous GET.
     *
     * See docs/timeout-and-cancellation-model.md §4 and
     * docs/architecture-assessment-BullMQ-native-jobs-and-routing.md §4.2.
     */
    nearest: 8_000,
  },
} as const
