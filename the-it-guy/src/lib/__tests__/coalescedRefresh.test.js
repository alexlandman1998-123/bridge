import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCoalescedRefresh } from '../coalescedRefresh'

const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
afterEach(() => vi.useRealTimers())

describe('coalesced screen refreshes', () => {
  it('runs a burst as one active read and one trailing read with the latest options', async () => {
    vi.useFakeTimers()
    const queue = createCoalescedRefresh({ minIntervalMs: 5000 })
    const first = deferred()
    const read = vi.fn(() => first.promise)
    const initial = queue.run('agency:viewer', read)
    await vi.advanceTimersByTimeAsync(0)
    const trailing = []
    const latest = vi.fn(() => 'latest range')
    for (let index = 0; index < 50; index += 1) trailing.push(queue.run('agency:viewer', latest))
    expect(read).toHaveBeenCalledTimes(1)
    expect(latest).not.toHaveBeenCalled()
    first.resolve('first range')
    await expect(initial).resolves.toBe('first range')
    await vi.advanceTimersByTimeAsync(4999)
    expect(latest).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(Promise.all(trailing)).resolves.toEqual(Array(50).fill('latest range'))
    expect(latest).toHaveBeenCalledTimes(1)
  })
  it('aborts the old scope and drops its trailing reads when the viewer changes', async () => {
    const queue = createCoalescedRefresh()
    let oldSignal
    const first = queue.run('first', (signal) => { oldSignal = signal; return new Promise(() => {}) })
    const rejectedFirst = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    const queued = vi.fn()
    const trailing = expect(queue.run('first', queued)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(queue.run('second', () => 'second viewer')).resolves.toBe('second viewer')
    await rejectedFirst
    await trailing
    expect(oldSignal.aborted).toBe(true)
    expect(queued).not.toHaveBeenCalled()
    queue.cancel()
  })
  it('backs off after failure while allowing an explicit retry to proceed', async () => {
    vi.useFakeTimers()
    const queue = createCoalescedRefresh()
    await expect(queue.run('scope', () => Promise.reject(new Error('Offline')))).rejects.toThrow('Offline')
    const read = vi.fn(() => 'recovered')
    const pending = queue.run('scope', read)
    await vi.advanceTimersByTimeAsync(10000)
    expect(read).not.toHaveBeenCalled()
    const retry = queue.run('scope', read, { immediate: true })
    await expect(pending).resolves.toBe('recovered')
    await expect(retry).resolves.toBe('recovered')
    expect(read).toHaveBeenCalledTimes(1)
  })
})
