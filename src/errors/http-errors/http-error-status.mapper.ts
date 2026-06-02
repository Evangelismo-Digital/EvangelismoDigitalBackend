import { ErrorType } from "core/types/error-type/error-type"

const STATUS_MAP: Record<ErrorType, number> = {
  [ErrorType.BAD_REQUEST]: 400,
  [ErrorType.UNAUTHORIZED]: 401,
  [ErrorType.FORBIDDEN]: 403,
  [ErrorType.NOT_FOUND]: 404,
  [ErrorType.CONFLICT]: 409,
  [ErrorType.UNPROCESSABLE_ENTITY]: 422,
  [ErrorType.INTERNAL_SERVER_ERROR]: 500,
  [ErrorType.TOO_MANY_REQUESTS]: 429,
  [ErrorType.SERVICE_UNAVAILABLE]: 503,
}

export function toHttpStatus(type: ErrorType): number {
  return STATUS_MAP[type] ?? 500
}
