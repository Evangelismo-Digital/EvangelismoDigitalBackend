import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FindNearbyChurchesKnnUseCase } from './find-nearby-churches-knn-use-case'
import { ChurchesRepository, FindNearbyParams } from 'core/contracts/repository/churches-repository.interface'
import { Deadline } from 'core/shared/deadline'
import { ok, isErr } from 'core/shared/result'
import { CHURCH_CONSTANTS } from 'messages/constants/churches/churches'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'

/**
 * The KNN leg is the one step the driver cannot cancel once it is running, so
 * everything here is about the ceiling handed to the database.
 */
describe('FindNearbyChurchesKnnUseCase — query budget', () => {
  let repository: ChurchesRepository
  let useCase: FindNearbyChurchesKnnUseCase

  beforeEach(() => {
    vi.useFakeTimers()
    repository = { findNearest: vi.fn().mockResolvedValue(ok([])) } as unknown as ChurchesRepository
    useCase = new FindNearbyChurchesKnnUseCase(repository)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function timeoutPassed(): number | undefined {
    return (vi.mocked(repository.findNearest).mock.calls[0][0] as FindNearbyParams).timeoutMs
  }

  it('caps the query at its own budget when the request has plenty of time', async () => {
    await useCase.execute({ userLat: -23.55, userLon: -46.63, deadline: Deadline.in(60_000) })

    expect(timeoutPassed()).toBe(CHURCH_CONSTANTS.KNN_BUDGET_MS)
  })

  it('narrows to whatever the request has left when that is tighter', async () => {
    await useCase.execute({ userLat: -23.55, userLon: -46.63, deadline: Deadline.in(250) })

    expect(timeoutPassed()).toBe(250)
  })

  it('shrinks as the request budget is spent', async () => {
    const deadline = Deadline.in(1_500)

    vi.advanceTimersByTime(1_000)
    await useCase.execute({ userLat: -23.55, userLon: -46.63, deadline })

    expect(timeoutPassed()).toBe(500)
  })

  it('never asks the database for more time than the request has', async () => {
    const deadline = Deadline.in(100)

    await useCase.execute({ userLat: -23.55, userLon: -46.63, deadline })

    expect(timeoutPassed()).toBeLessThanOrEqual(deadline.remainingMs())
    expect(timeoutPassed()).toBeLessThanOrEqual(CHURCH_CONSTANTS.KNN_BUDGET_MS)
  })

  it('sends no ceiling at all for an unbounded caller', async () => {
    // Workers and scripts keep the plain query — and avoid the extra
    // BEGIN/COMMIT that enforcing a ceiling costs.
    await useCase.execute({ userLat: -23.55, userLon: -46.63 })

    expect(timeoutPassed()).toBeUndefined()
  })

  it('does not touch the database at all once the budget is spent', async () => {
    const result = await useCase.execute({ userLat: -23.55, userLon: -46.63, deadline: Deadline.in(0) })

    expect(repository.findNearest).not.toHaveBeenCalled()
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(DeadlineExceededError)
    }
  })

  it('still validates coordinates before spending any budget', async () => {
    const result = await useCase.execute({ userLat: 91, userLon: -46.63, deadline: Deadline.in(60_000) })

    expect(isErr(result)).toBe(true)
    expect(repository.findNearest).not.toHaveBeenCalled()
  })
})
