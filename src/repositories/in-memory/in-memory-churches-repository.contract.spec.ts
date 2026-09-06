import { describeChurchesRepositoryContract } from '../churches-repository.contract'
import { InMemoryChurchesRepository } from './in-memory-chuches-repository'

/**
 * The double must satisfy the same contract as the real repository.
 *
 * Its counterpart runs the identical scenarios against Docker Postgres
 * (`prisma-churches-repository.integration.spec.ts`), so a divergence like D19
 * or D20 shows up as a failing test rather than as a unit suite quietly
 * asserting a fiction.
 */
describeChurchesRepositoryContract('in-memory double', {
  create: () => new InMemoryChurchesRepository(),
})
