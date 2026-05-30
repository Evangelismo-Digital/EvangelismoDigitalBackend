import { cepSchema } from '@http/schemas/utils/cep'
import { ChurchPresenter } from '@http/presenters/church-presenter'
import { logger } from '@lib/logger'
import { User } from '@use-cases/churches/calculate-church-route-distances-use-case'
import { LatitudeRangeError } from '@use-cases/errors/latitude-range-error'
import { LongitudeRangeError } from '@use-cases/errors/longitude-range-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { makeCepToLatLonUseCase } from '@use-cases/factories/make-cep-to-lat-lon-use-case'
import { makeFindNearbyChurchesKnnUseCase } from '@use-cases/factories/make-find-nearby-churches-knn-use-case'
import { makeCalculateChurchRouteDistancesUseCase } from '@use-cases/factories/make-calculate-church-route-distances-use-case'
import { FastifyReply, FastifyRequest } from 'fastify'
import { GeoServiceBusyError } from '@use-cases/errors/geo-service-busy-error'
import { AddressServiceBusyError } from '@use-cases/errors/address-service-busy-error'
import { TimeoutExceededOnFetchError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'
import { ServiceOverloadError } from '@lib/errors/infra/cache/service-overload-error'
import { AddressProviderFailureError } from 'providers/address-provider/error/address-provider-failure-error'
import { GeoProviderFailureError } from '@use-cases/errors/geo-provider-failure-error'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { env } from '@env/index'

export async function findNearestChurches(
  request: FastifyRequest<{ Querystring: { cep: string } }>,
  reply: FastifyReply,
) {
  try {
    const cep = cepSchema.parse(request.query.cep)

    if (env.NODE_ENV !== 'production' || Math.random() < 0.1) {
      logger.info({
        msg: 'Cep do usuário recebido para encontrar igrejas próximas',
        ip: request.ip,
      })
    }

    const cepToLatLonUseCase = makeCepToLatLonUseCase()
    const { userLat, userLon, precision, providerName } = await cepToLatLonUseCase.execute({ cep })

    if (env.NODE_ENV !== 'production' || Math.random() < 0.1) {
      logger.info({
        msg: 'Coordenadas obtidas a partir do CEP',
        userLat,
        userLon,
      })
    }

    const findNearbyChurchesKnnUseCase = makeFindNearbyChurchesKnnUseCase()

    const { churches, totalFound } = await findNearbyChurchesKnnUseCase.execute({
      userLat: userLat,
      userLon: userLon,
    })

    const calculateChurchRouteDistancesUseCase = makeCalculateChurchRouteDistancesUseCase()

    const user: User = { userLat, userLon }

    const theNearestChurch = await calculateChurchRouteDistancesUseCase.findNearest({ churches, user })

    logger.info({
      msg: 'Igreja mais próxima encontrada com sucesso',
      theNearestChurch,
    })

    if (env.NODE_ENV !== 'production' || Math.random() < 0.1) {
      logger.info({
        msg: 'Igrejas mais próximas encontradas com sucesso',
        totalFound,
      })
    }

    const sanitizedChurche = ChurchPresenter.toHTTP(theNearestChurch)

    return reply
      .status(200)
      .send({ theNearestChurchInfo: sanitizedChurche, totalFound, precision, providerName })

  } catch (error) {
    // 1. Erros de Negócio (Bad Request - 400)
    if (error instanceof LatitudeRangeError || error instanceof LongitudeRangeError) {
      logger.warn({ msg: 'Parâmetros inválidos', error: error.message })
      return reply.status(400).send({ message: error.message })
    }

    // 2. Erro de Recurso Não Encontrado (Not Found - 404)
    if (error instanceof InvalidCepError) {
      logger.warn({ msg: 'CEP inválido fornecido', cep: request.query.cep })
      return reply.status(404).send({ message: error.message })
    }

    if (error instanceof CoordinatesNotFoundError) {
      logger.info({ msg: 'Coordenadas não encontradas para o CEP', cep: request.query.cep })
      return reply.status(404).send({ message: error.message })
    }

    // 3. Erros de Rate Limit (Too Many Requests - 429)
    // Quando nossos providers ou o rate limiter interno bloqueiam
    if (
      error instanceof GeoServiceBusyError ||
      error instanceof AddressServiceBusyError ||
      error instanceof ServiceOverloadError
    ) {
      logger.warn({
        msg: 'Serviço ocupado (Rate Limit) ou capacidade máxima de maxPendingFetches atingida',
        error: error.message,
      })
      return reply.status(429).send({ message: 'Serviço ocupado, por favor tente novamente mais tarde.' })
    }

    // 4. Erros de Sistema / Indisponibilidade (Service Unavailable - 503)
    // Timeouts, Circuit Breaker aberto ou falha de conexão com provider
    if (
      error instanceof TimeoutExceededOnFetchError ||
      error instanceof AddressProviderFailureError ||
      error instanceof GeoProviderFailureError ||
      error instanceof CepToLatLonError
    ) {
      logger.error({ msg: 'Falha temporária nos provedores externos', error: error.message })
      return reply.status(503).send({
        message:
          'Não foi possível localizar igrejas próximas agora. Verifique o CEP ou tente novamente mais tarde. Estamos trabalhando para normalizar o serviço.',
      })
    }

    throw error
  }
}
