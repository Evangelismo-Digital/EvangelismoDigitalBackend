/**
 * The HTTP status codes this API returns.
 *
 * Controllers used to write `reply.code(200)` directly. Three digits are not
 * hard to read, but they are hard to *search*: "which routes still answer 204?"
 * had no answer short of grepping for a number that also appears in timeouts,
 * ports and byte counts. Naming them makes the set of statuses the API actually
 * uses an explicit, greppable list — and makes a typo (`reply.code(20)`) a type
 * error rather than a response.
 *
 * Only codes this application actually returns are listed. A new one is added
 * here first, which is the moment to ask whether it belongs in the contract.
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const
