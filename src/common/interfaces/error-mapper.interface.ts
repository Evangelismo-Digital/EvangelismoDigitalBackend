export interface IErrorMapper {
  /**
   * Returns `unknown`, not `T | unknown`: the union collapses to `unknown` for
   * the compiler, so the old signature promised a narrowing it never gave.
   * Callers that need a typed error must narrow at the call site.
   */
  mapToKnownError(error: unknown): unknown
}
