import { FastifyRequest, RouteGenericInterface, RawServerDefault, FastifySchema } from 'fastify'
import { IncomingMessage } from 'node:http'
import { ZodTypeProvider } from 'fastify-type-provider-zod'

export type ZodRequest<Schema extends FastifySchema> = FastifyRequest<
  RouteGenericInterface,
  RawServerDefault,
  IncomingMessage,
  Schema,
  ZodTypeProvider
>
