import { ErrorType } from 'core/types/error-type/error-type'
import { safeLookup } from 'core/shared/safe-lookup'
import { HTTP_STATUS } from '@http/http-status'

const STATUS_MAP: Record<ErrorType, number> = {
  [ErrorType.OK]: HTTP_STATUS.OK,
  [ErrorType.BAD_REQUEST]: HTTP_STATUS.BAD_REQUEST,
  [ErrorType.UNAUTHORIZED]: HTTP_STATUS.UNAUTHORIZED,
  [ErrorType.FORBIDDEN]: HTTP_STATUS.FORBIDDEN,
  [ErrorType.NOT_FOUND]: HTTP_STATUS.NOT_FOUND,
  [ErrorType.CONFLICT]: HTTP_STATUS.CONFLICT,
  [ErrorType.UNPROCESSABLE_ENTITY]: HTTP_STATUS.UNPROCESSABLE_ENTITY,
  [ErrorType.INTERNAL_SERVER_ERROR]: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  [ErrorType.TOO_MANY_REQUESTS]: HTTP_STATUS.TOO_MANY_REQUESTS,
  [ErrorType.SERVICE_UNAVAILABLE]: HTTP_STATUS.SERVICE_UNAVAILABLE,
}

export function toHttpStatus(type: ErrorType): number {
  // `?? 500` looks like it covers the unknown case and does not: an error
  // rebuilt from a cache envelope can carry any string as its `type`, and
  // `STATUS_MAP['constructor']` returns a function — non-null, so the fallback
  // never fires and `reply.code(fn)` throws inside the error handler itself.
  return safeLookup(STATUS_MAP, type) ?? HTTP_STATUS.INTERNAL_SERVER_ERROR
}
