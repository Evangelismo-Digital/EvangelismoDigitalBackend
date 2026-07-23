import { ErrorType } from 'core/types/error-type/error-type'
import { SYSTEM_ERRORS } from 'messages/errors/system'
import { SystemError } from 'errors/system-error'

export class AsyncLocalStorageNotInitializedError extends SystemError {
  constructor() {
    super(SYSTEM_ERRORS.ASYNC_LOCAL_STORAGE_NOT_INITIALIZED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
