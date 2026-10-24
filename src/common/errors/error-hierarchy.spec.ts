import { describe, it, expect } from 'vitest'
import { ErrorType } from '@common/types/error-type/error-type'
import { AppError } from '@common/errors/app-error'
import { DomainError } from '@common/errors/domain-error'
import { InfrastructureError } from '@common/errors/infrastructure-error'
import { SystemError } from '@common/errors/system-error'
import {
  AppErrorRegistry,
  serializeAppError,
  deserializeAppError,
  type SerializedErrorData,
} from '@common/errors/app-error-registry'
import { DatabaseQueryError } from '@common/errors/infrastructure/database-query-error'
import { ProviderFailureError } from '@common/errors/infrastructure/provider-failure-error'
import { CircuitOpenError } from '@common/errors/infrastructure/circuit-open-error'
import { DeadlineExceededError } from '@common/errors/infrastructure/deadline-exceeded-error'
import { ProviderRateLimitError } from '@common/errors/infrastructure/provider-rate-limit-error'
import { ConcurrencyLimitError } from '@common/errors/infrastructure/concurrency-limit-error'
import { TimeoutExceededError } from '@common/errors/infrastructure/timeout-exceeded-error'
import { toHttpStatus } from '@common/filters/http-error-status.mapper'
import { ZodValidationError } from '@common/filters/zod-validation-error'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { ChurchAlreadyExistsError } from '@modules/churches/errors/church-already-exists-error'
import { ChurchNotFoundError } from '@modules/churches/errors/church-not-found-error'
import { CreateChurchError } from '@modules/churches/errors/create-church-error'
import { EmptyChurchListError } from '@modules/churches/errors/empty-church-list-error'
import { NoNearbyChurchesFoundError } from '@modules/churches/errors/no-nearby-churches-found-error'
import { CepToLatLonError } from '@modules/churches/errors/cep-to-lat-lon-error'
import { CoordinatesNotFoundError } from '@modules/churches/errors/coordinates-not-found-error'
import { InvalidCepError } from '@modules/churches/errors/invalid-cep-error'
import { LatitudeRangeError } from '@modules/churches/errors/latitude-range-error'
import { LongitudeRangeError } from '@modules/churches/errors/longitude-range-error'
import { NoAddressError } from '@modules/churches/errors/no-address-error'
import { FormSubmissionError } from '@modules/forms/errors/form-submission-error'
import { FormAlreadyExistsError } from '@modules/forms/errors/form-already-exists-error'
import { FormNotFoundError } from '@modules/forms/errors/form-not-found-error'
import { InvalidFormPayloadError } from '@modules/forms/errors/invalid-form-payload-error'
import { InvalidCredentialsError } from '@modules/auth/errors/invalid-credentials-error'
import { InvalidPasswordResetPayloadError } from '@modules/auth/errors/invalid-password-reset-payload-error'
import { InvalidTokenError } from '@modules/auth/errors/invalid-token-error'
import { UserAlreadyExistsError } from '@modules/users/errors/user-already-exists-error'
import { UserNotCreatedError } from '@modules/users/errors/user-not-created-error'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { VisitorNotFoundError } from '@modules/analytics/errors/visitor-not-found-error'
import {
  OutboxEventNotFoundDomainError,
  OutboxOperationFailedSystemError,
  OutboxEventNotFoundInfraError,
  OutboxOperationFailedInfraError,
} from '@infra/outbox/errors/outbox-errors'
import { UnknownOutboxEventTypeError } from '@infra/outbox/errors/unknown-outbox-event-type-error'
import { JobAlreadyProcessingError } from '@infra/mail/errors/job-already-processing-error'
import { SmtpDispatchError } from '@infra/mail/errors/smtp-dispatch-error'
import { NoAddressProviderError } from '@infra/providers/address-provider/errors/no-address-provider-error'
import { NoGeoProviderError } from '@infra/providers/geo-provider/errors/no-geo-provider-error'
import { NoRoutingProviderError } from '@infra/providers/church-routing-provider/errors/no-routing-provider-error'
import { AsyncLocalStorageNotInitializedError } from '@infra/logger/errors/async-local-storage-not-initialized-error'

class TestDomainError extends DomainError {
  constructor() {
    super({ code: 'TEST_CODE', message: 'Test message' }, ErrorType.BAD_REQUEST)
  }
}

class TestInfrastructureError extends InfrastructureError {
  constructor() {
    super({ code: 'INFRA_CODE', message: 'Infra message' }, undefined, ErrorType.INTERNAL_SERVER_ERROR)
  }
}

class TestSystemError extends SystemError {
  constructor() {
    super({ code: 'SYS_CODE', message: 'Sys message' }, ErrorType.INTERNAL_SERVER_ERROR)
  }
}

describe('Error Hierarchy Architecture', () => {
  describe('Base Error Hierarchies', () => {
    it('DomainError extends AppError and Error', () => {
      const err = new TestDomainError()
      expect(err).toBeInstanceOf(AppError)
      expect(err).toBeInstanceOf(Error)
      expect(err.body.code).toBe('TEST_CODE')
      expect(err.message).toBe('Test message')
    })

    it('InfrastructureError extends AppError and Error', () => {
      const err = new TestInfrastructureError()
      expect(err).toBeInstanceOf(AppError)
      expect(err).toBeInstanceOf(Error)
      expect(err.body.code).toBe('INFRA_CODE')
      expect(err.message).toBe('Infra message')
    })

    it('SystemError extends AppError and Error', () => {
      const err = new TestSystemError()
      expect(err).toBeInstanceOf(AppError)
      expect(err).toBeInstanceOf(Error)
      expect(err.body.code).toBe('SYS_CODE')
      expect(err.message).toBe('Sys message')
    })
  })

  describe('Domain Errors - Churches', () => {
    it('instantiates all church error types with proper inheritance and names', () => {
      const alreadyExists = new ChurchAlreadyExistsError()
      expect(alreadyExists).toBeInstanceOf(DomainError)
      expect(alreadyExists.name).toBe('ChurchAlreadyExistsError')

      const notFound = new ChurchNotFoundError()
      expect(notFound).toBeInstanceOf(DomainError)
      expect(notFound.name).toBe('ChurchNotFoundError')

      const createFailed = new CreateChurchError()
      expect(createFailed).toBeInstanceOf(SystemError)
      expect(createFailed.name).toBe('CreateChurchError')

      const emptyList = new EmptyChurchListError()
      expect(emptyList).toBeInstanceOf(DomainError)
      expect(emptyList.name).toBe('EmptyChurchListError')

      const noNearby = new NoNearbyChurchesFoundError()
      expect(noNearby).toBeInstanceOf(DomainError)
      expect(noNearby.name).toBe('NoNearbyChurchesFoundError')
    })
  })

  describe('Domain Errors - Forms', () => {
    it('instantiates all form error types with proper inheritance', () => {
      const submission = new FormSubmissionError()
      expect(submission).toBeInstanceOf(DomainError)
      expect(submission.name).toBe('FormSubmissionError')
      expect(submission.type).toBe(ErrorType.BAD_REQUEST)

      const alreadyExists = new FormAlreadyExistsError()
      expect(alreadyExists).toBeInstanceOf(DomainError)
      expect(alreadyExists.name).toBe('FormAlreadyExistsError')
      expect(alreadyExists.type).toBe(ErrorType.CONFLICT)

      const notFound = new FormNotFoundError()
      expect(notFound).toBeInstanceOf(DomainError)
      expect(notFound.name).toBe('FormNotFoundError')
      expect(notFound.type).toBe(ErrorType.NOT_FOUND)

      const invalidPayload = new InvalidFormPayloadError('email')
      expect(invalidPayload).toBeInstanceOf(DomainError)
      expect(invalidPayload.name).toBe('InvalidFormPayloadError')
      expect(invalidPayload.type).toBe(ErrorType.BAD_REQUEST)
      expect(invalidPayload.message).toContain('email')
    })
  })

  describe('Domain Errors - Geolocation', () => {
    it('instantiates all geolocation error types with proper inheritance', () => {
      const cepToLatLon = new CepToLatLonError('24020000')
      expect(cepToLatLon).toBeInstanceOf(SystemError)
      expect(cepToLatLon.message).toContain('24020000')

      const coordsNotFound = new CoordinatesNotFoundError()
      expect(coordsNotFound).toBeInstanceOf(DomainError)

      const invalidCep = new InvalidCepError('12345')
      expect(invalidCep).toBeInstanceOf(DomainError)

      const latRange = new LatitudeRangeError()
      expect(latRange).toBeInstanceOf(DomainError)

      const lonRange = new LongitudeRangeError()
      expect(lonRange).toBeInstanceOf(DomainError)

      const noAddress = new NoAddressError()
      expect(noAddress).toBeInstanceOf(DomainError)
    })
  })

  describe('Domain Errors - Outbox', () => {
    it('instantiates outbox errors in both HTTP and infra contexts', () => {
      const httpNotFound = new OutboxEventNotFoundDomainError()
      expect(httpNotFound).toBeInstanceOf(DomainError)

      const httpFailed = new OutboxOperationFailedSystemError()
      expect(httpFailed).toBeInstanceOf(SystemError)

      const infraNotFound = new OutboxEventNotFoundInfraError()
      expect(infraNotFound).toBeInstanceOf(InfrastructureError)

      const infraFailed = new OutboxOperationFailedInfraError()
      expect(infraFailed).toBeInstanceOf(InfrastructureError)

      const unknownType = new UnknownOutboxEventTypeError('MAIL_SEND')
      expect(unknownType).toBeInstanceOf(InfrastructureError)
    })
  })

  describe('Domain Errors - Auth, Users, and Analytics', () => {
    it('instantiates all auth, user, and analytics error types with proper inheritance', () => {
      const creds = new InvalidCredentialsError()
      expect(creds).toBeInstanceOf(DomainError)

      const resetPayload = new InvalidPasswordResetPayloadError('password')
      expect(resetPayload).toBeInstanceOf(DomainError)

      const token = new InvalidTokenError()
      expect(token).toBeInstanceOf(DomainError)

      const userExists = new UserAlreadyExistsError()
      expect(userExists).toBeInstanceOf(DomainError)

      const notCreated = new UserNotCreatedError()
      expect(notCreated).toBeInstanceOf(SystemError)

      const notFound = new UserNotFoundError()
      expect(notFound).toBeInstanceOf(DomainError)

      const visitorNotFound = new VisitorNotFoundError()
      expect(visitorNotFound).toBeInstanceOf(DomainError)
    })
  })

  describe('Infrastructure Errors', () => {
    it('instantiates database, queue, and provider errors', () => {
      const dbErr = new DatabaseQueryError(new Error('connection timeout'))
      expect(dbErr).toBeInstanceOf(InfrastructureError)
      expect(dbErr.name).toBe('DatabaseQueryError')

      const noAddressProv = new NoAddressProviderError()
      expect(noAddressProv).toBeInstanceOf(InfrastructureError)

      const noGeoProv = new NoGeoProviderError()
      expect(noGeoProv).toBeInstanceOf(InfrastructureError)

      const noRoutingProv = new NoRoutingProviderError()
      expect(noRoutingProv).toBeInstanceOf(InfrastructureError)

      const provFailure = new ProviderFailureError(new Error('upstream 500'))
      expect(provFailure).toBeInstanceOf(InfrastructureError)

      const queueBusy = new JobAlreadyProcessingError()
      expect(queueBusy).toBeInstanceOf(InfrastructureError)

      const smtpFail = new SmtpDispatchError()
      expect(smtpFail).toBeInstanceOf(InfrastructureError)
    })

    it('instantiates resilience infrastructure errors', () => {
      const circuit = new CircuitOpenError('GoogleMaps')
      expect(circuit).toBeInstanceOf(InfrastructureError)
      expect(circuit.provider).toBe('GoogleMaps')

      const deadline = new DeadlineExceededError('Deadline passed')
      expect(deadline).toBeInstanceOf(InfrastructureError)

      const serviceBusy = new ProviderRateLimitError('ViaCep')
      expect(serviceBusy).toBeInstanceOf(InfrastructureError)
      expect(serviceBusy.provider).toBe('ViaCep')

      const overload = new ConcurrencyLimitError()
      expect(overload).toBeInstanceOf(InfrastructureError)

      const timeout = new TimeoutExceededError('Request timed out')
      expect(timeout).toBeInstanceOf(InfrastructureError)
    })
  })

  describe('System Errors', () => {
    it('instantiates AsyncLocalStorageNotInitializedError', () => {
      const alsErr = new AsyncLocalStorageNotInitializedError()
      expect(alsErr).toBeInstanceOf(SystemError)
    })
  })

  describe('HTTP Utilities and Mapper Exports', () => {
    it('exports toHttpStatus, ZodValidationError and HttpErrorMapper correctly', () => {
      expect(typeof toHttpStatus).toBe('function')
      expect(typeof HttpErrorMapper.map).toBe('function')

      const zodErr = new ZodValidationError({ email: 'Required' })
      expect(zodErr).toBeInstanceOf(AppError)
      expect(zodErr.type).toBe(ErrorType.BAD_REQUEST)
    })
  })

  describe('Error Registry and Serialization', () => {
    it('exports AppErrorRegistry, serializeAppError, deserializeAppError, and SerializedErrorData', () => {
      expect(typeof AppErrorRegistry).toBe('object')
      expect(typeof serializeAppError).toBe('function')
      expect(typeof deserializeAppError).toBe('function')

      const sampleData: SerializedErrorData = { provider: 'ViaCep' }
      const err = new InvalidCepError('12345678')
      const serialized = serializeAppError(err)
      expect(serialized.type).toBe('InvalidCepError')

      const deserialized = deserializeAppError('InvalidCepError', '12345678', sampleData)
      expect(deserialized).toBeInstanceOf(InvalidCepError)
    })
  })
})
