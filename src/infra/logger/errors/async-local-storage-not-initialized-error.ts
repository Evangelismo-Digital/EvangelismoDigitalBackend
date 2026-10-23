import { ErrorType } from '@common/types/error-type/error-type'
import { SYSTEM_ERRORS } from '@common/messages/errors/system'
import { SystemError } from '@common/errors/system-error'

export class AsyncLocalStorageNotInitializedError extends SystemError {
  constructor() {
    super(SYSTEM_ERRORS.ASYNC_LOCAL_STORAGE_NOT_INITIALIZED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
