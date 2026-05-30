import { CalculateChurchRouteDistancesUseCase } from '@use-cases/churches/calculate-church-route-distances-use-case'
import { env } from '@env/index'
import { StadiaChurchRoutingProvider } from 'providers/church-routing-provider/stadia-church-routing-provider'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'

export function makeCalculateChurchRouteDistancesUseCase() {
  const stadiaChurchRoutingProvider = new StadiaChurchRoutingProvider({
    apiUrl: env.STADIA_MAPS_API_URL,
    apiToken: env.STADIA_API_TOKEN,
    defaultCosting: RoutingProfile.PEDESTRIAN,
  })

  const calculateChurchRouteDistancesUseCase = new CalculateChurchRouteDistancesUseCase(stadiaChurchRoutingProvider)

  return calculateChurchRouteDistancesUseCase
}
