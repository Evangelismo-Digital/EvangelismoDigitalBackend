/**
 * The in-memory double, run against the shared AnalyticsRepository contract.
 *
 * Its counterpart is prisma-analytics-repository.integration.spec.ts, which runs
 * the identical scenarios against a real Postgres. Passing here and failing
 * there is precisely the divergence this pair exists to surface.
 */
import { InMemoryAnalyticsRepository } from './in-memory-analytics-repository'
import { describeAnalyticsRepositoryContract } from '../analytics-repository.contract'

describeAnalyticsRepositoryContract('in-memory', {
  create: () => new InMemoryAnalyticsRepository(),
  // No referential integrity to satisfy: any string is a valid link here.
  createLinkableUser: () => 'user-public-id',
})
