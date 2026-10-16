import { describe, it, expect } from 'vitest'
import { ErrorType } from 'core/types/error-type/error-type'
import {
  AppError,
  DomainError,
  InfrastructureError,
  SystemError,
  // Domain - Churches
  ChurchAlreadyExistsError,
  ChurchNotFoundError,
  CreateChurchError,
  EmptyChurchListError,
  NoNearbyChurchesFoundError,
  // Domain - Forms
  FormSubmissionError,
  FormsAlreadyExistsError,
  FormsNotFoundError,
  FormsSubmissionError,
  InvalidFormPayloadError,
  // Domain - Geolocation
  CepToLatLonError,
  CoordinatesNotFoundError,
  InvalidCepError,
  LatitudeRangeError,
  LongitudeRangeError,
  NoAddressError,
  // Domain - Outbox
  OutboxEventNotFoundHttpError,
  OutboxOperationFailedHttpError,
  OutboxEventNotFoundInfraError,
  OutboxOperationFailedInfraError,
  UnknownOutboxEventTypeError,
  // Domain - Users
  InvalidCredentialsError,
  InvalidPasswordResetPayloadError,
  InvalidTokenError,
  UserAlreadyExistsError,
  UserNotCreatedError,
  UserNotFoundError,
  VisitorNotFoundError,
  // Infrastructure - Database
  DatabaseQueryError,
  // Infrastructure - Providers
  NoAddressProviderError,
  NoGeoProviderError,
  NoRoutingProviderError,
  ProviderFailureError,
  // Infrastructure - Queue
  JobAlreadyProcessingError,
  SmtpDispatchError,
  // Infrastructure - Resilience
  CircuitOpenError,
  DeadlineExceededError,
  ServiceBusyError,
  ServiceOverloadError,
  TimeoutExceededError,
  // System
  AsyncLocalStorageNotInitializedError,
  // HTTP
  toHttpStatus,
  ZodValidationError,
  HttpErrorMapper,
  // Registry & Serialization
  AppErrorRegistry,
  serializeAppError,
  deserializeAppError,
  type SerializedErrorData,
} from 'errors'

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

describe('Centralized Errors Architecture', () => {
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
      expect(createFailed).toBeInstanceOf(DomainError)
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

      const alreadyExists = new FormsAlreadyExistsError()
      expect(alreadyExists).toBeInstanceOf(DomainError)
      expect(alreadyExists.name).toBe('FormsAlreadyExistsError')

      const notFound = new FormsNotFoundError()
      expect(notFound).toBeInstanceOf(DomainError)
      expect(notFound.name).toBe('FormsNotFoundError')

      const formsSubmission = new FormsSubmissionError()
      expect(formsSubmission).toBeInstanceOf(DomainError)
      expect(formsSubmission.name).toBe('FormsSubmissionError')

      const invalidPayload = new InvalidFormPayloadError('email')
      expect(invalidPayload).toBeInstanceOf(DomainError)
      expect(invalidPayload.name).toBe('InvalidFormPayloadError')
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
      const httpNotFound = new OutboxEventNotFoundHttpError()
      expect(httpNotFound).toBeInstanceOf(DomainError)

      const httpFailed = new OutboxOperationFailedHttpError()
      expect(httpFailed).toBeInstanceOf(SystemError)

      const infraNotFound = new OutboxEventNotFoundInfraError()
      expect(infraNotFound).toBeInstanceOf(InfrastructureError)

      const infraFailed = new OutboxOperationFailedInfraError()
      expect(infraFailed).toBeInstanceOf(InfrastructureError)

      const unknownType = new UnknownOutboxEventTypeError('MAIL_SEND')
      expect(unknownType).toBeInstanceOf(InfrastructureError)
    })
  })

  describe('Domain Errors - Users', () => {
    it('instantiates all user error types with proper inheritance', () => {
      const creds = new InvalidCredentialsError()
      expect(creds).toBeInstanceOf(DomainError)

      const resetPayload = new InvalidPasswordResetPayloadError('password')
      expect(resetPayload).toBeInstanceOf(DomainError)

      const token = new InvalidTokenError()
      expect(token).toBeInstanceOf(DomainError)

      const userExists = new UserAlreadyExistsError()
      expect(userExists).toBeInstanceOf(DomainError)

      const notCreated = new UserNotCreatedError()
      expect(notCreated).toBeInstanceOf(DomainError)

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

      const serviceBusy = new ServiceBusyError('ViaCep')
      expect(serviceBusy).toBeInstanceOf(InfrastructureError)
      expect(serviceBusy.provider).toBe('ViaCep')

      const overload = new ServiceOverloadError()
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
