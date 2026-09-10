import { AnalyticsRepository } from 'core/contracts/repository/analytics-repository.interface'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

/**
 * Erases a data subject's analytics record (§5.1, §5.3).
 *
 * Two entry points because there are two distinct rights, reached by different
 * people in different states:
 *
 * - `byVisitor` backs consent revocation. The caller is anonymous by definition
 *   — asking someone to authenticate before they may withdraw consent would
 *   make the withdrawal conditional on giving up more data.
 * - `byUser` backs the authenticated right to erasure, and reaches every browser
 *   the account was ever linked to.
 *
 * Erasing nothing is a success. A revocation from a visitor who was never
 * tracked is the normal case, not an error to report back.
 */
export class EraseAnalyticsDataUseCase {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  // Both delegate directly. The `isErr` guard that used to sit here re-wrapped a
  // success into an identical success and returned the failure unchanged — an
  // equivalent mutant in both directions, which is the precise signature of a
  // branch that cannot affect an outcome. The Result type already propagates.
  async byVisitor(visitorId: string): Promise<Result<number, AppError>> {
    return this.analyticsRepository.deleteVisitorData(visitorId)
  }

  async byUser(userId: string): Promise<Result<number, AppError>> {
    return this.analyticsRepository.deleteDataForUser(userId)
  }
}
