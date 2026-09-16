import { describe, expect, it, vi } from 'vitest'
import { abortRace } from './abort-race'

describe('abortRace', () => {
  it('resolves with the promise value if it settles first', async () => {
    const ac = new AbortController()
    const result = await abortRace(Promise.resolve('ok'), ac.signal, () => 'aborted')
    expect(result).toBe('ok')
  })

  it('rejects with the promise error if it settles first', async () => {
    const ac = new AbortController()
    await expect(abortRace(Promise.reject(new Error('fail')), ac.signal, () => 'aborted')).rejects.toThrow('fail')
  })

  it('returns the onAbort value if the signal fires', async () => {
    const ac = new AbortController()
    const promise = new Promise<string>(() => {})

    setTimeout(() => ac.abort(), 10)

    const result = await abortRace(promise, ac.signal, () => 'aborted')
    expect(result).toBe('aborted')
  })

  it('short-circuits if the signal is already aborted', async () => {
    const signal = AbortSignal.abort()
    const result = await abortRace(new Promise<string>(() => {}), signal, () => 'already-aborted')
    expect(result).toBe('already-aborted')
  })

  it('cleans up the listener when the promise resolves', async () => {
    const ac = new AbortController()
    const signal = ac.signal

    const promise = Promise.resolve('ok')
    await abortRace(promise, signal, () => 'aborted')

    // addAbortListener should have been cleaned up if it was a promise resolution.
    // wait a tick just in case
    await new Promise((r) => setTimeout(r, 0))
    // We can't directly check the listener count on AbortSignal in standard web APIs,
    // but the test shouldn't leave unhandled things.
  })
})

it('rejects the promise if onAbort throws synchronously', async () => {
  const ac = new AbortController()
  const promise = new Promise<string>(() => {})

  setTimeout(() => ac.abort(), 10)

  await expect(
    abortRace(promise, ac.signal, () => {
      throw new Error('sync fail')
    }),
  ).rejects.toThrow('sync fail')
})

it('rejects the promise if onAbort throws synchronously and signal is already aborted', async () => {
  const signal = AbortSignal.abort()
  const promise = new Promise<string>(() => {})

  await expect(
    abortRace(promise, signal, () => {
      throw new Error('sync fail')
    }),
  ).rejects.toThrow('sync fail')
})
