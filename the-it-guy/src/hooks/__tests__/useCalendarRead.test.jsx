// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useCalendarRead from '../useCalendarRead'

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const advance = async ms => { await act(async () => vi.advanceTimersByTimeAsync(ms)) }
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('coalesces twenty spaced focus events behind one actual read, then refreshes once', async () => {
  const pending = deferred(), next = deferred()
  const read = vi.fn().mockReturnValueOnce(pending.promise).mockReturnValueOnce(next.promise)
  const { result } = renderHook(() => useCalendarRead({ scopeKey: 'org:viewer', read }))
  await advance(0)
  for (let n = 0; n < 20; n++) {
    act(() => window.dispatchEvent(new Event('focus')))
    await advance(150)
  }
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => pending.resolve(['saved']))
  expect(result.current.data).toEqual(['saved'])
  await advance(1999)
  expect(read).toHaveBeenCalledTimes(1)
  await advance(1)
  expect(read).toHaveBeenCalledTimes(2)
  await act(async () => next.resolve(['fresh']))
  expect(result.current.data).toEqual(['fresh'])
})

it('aborts the transport at the deadline but waits for it to settle before starting a queued retry', async () => {
  const pending = deferred()
  const read = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(['retry'])
  const { result } = renderHook(() => useCalendarRead({ scopeKey: 'scope', read, timeoutMs: 1000 }))
  await advance(1000)
  expect(read.mock.calls[0][0].aborted).toBe(true)
  expect(result.current.status).toBe('error')
  act(() => { void result.current.reload() })
  await advance(60000)
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => pending.resolve(['late']))
  await advance(0)
  expect(read).toHaveBeenCalledTimes(2)
  expect(result.current.data).toEqual(['retry'])
})

it('retains verified data, backs off after failure, and lets Retry bypass the pause', async () => {
  const read = vi.fn().mockResolvedValueOnce(['saved']).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(['recovered'])
  const { result } = renderHook(() => useCalendarRead({ scopeKey: 'scope', read }))
  await advance(0)
  act(() => window.dispatchEvent(new Event('online')))
  await advance(5000)
  expect(result.current.data).toEqual(['saved'])
  expect(result.current.error).toBe('Unavailable')
  act(() => window.dispatchEvent(new Event('focus')))
  await advance(10000)
  expect(read).toHaveBeenCalledTimes(2)
  await act(async () => result.current.reload())
  expect(read).toHaveBeenCalledTimes(3)
  expect(result.current.data).toEqual(['recovered'])
})

it('aborts old viewers, discards their late results, and cancels timers on unmount', async () => {
  const old = deferred(), current = deferred()
  const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const { result, rerender, unmount } = renderHook(({ key }) => useCalendarRead({ scopeKey: key, read }), { initialProps: { key: 'first' } })
  await advance(0)
  rerender({ key: 'second' })
  await advance(0)
  expect(read.mock.calls[0][0].aborted).toBe(true)
  await act(async () => old.resolve(['private']))
  expect(result.current.data).toBeNull()
  expect(result.current.hasSnapshot).toBe(false)
  unmount()
  expect(read.mock.calls[1][0].aborted).toBe(true)
  await act(async () => current.resolve([]))
  await advance(60000)
  expect(read).toHaveBeenCalledTimes(2)
})

it('does not reload on equivalent context objects or fresh callback identities', async () => {
  const read = vi.fn().mockResolvedValue(['saved'])
  const { rerender } = renderHook(({ scope }) => useCalendarRead({ scopeKey: JSON.stringify(scope), read: signal => read(signal) }), { initialProps: { scope: { org: 'org', viewer: 'agent' } } })
  await advance(0)
  for (let n = 0; n < 20; n++) rerender({ scope: { org: 'org', viewer: 'agent' } })
  await advance(0)
  expect(read).toHaveBeenCalledTimes(1)
})

it('ignores an old action callback rather than cancelling the new viewer’s read', async () => {
  const pending = deferred()
  const read = vi.fn().mockResolvedValueOnce(['first']).mockReturnValueOnce(pending.promise)
  const { result, rerender } = renderHook(({ key }) => useCalendarRead({ scopeKey: key, read }), { initialProps: { key: 'first' } })
  await advance(0)
  const oldRetry = result.current.reload
  rerender({ key: 'second' })
  await advance(0)
  await act(async () => oldRetry())
  expect(read).toHaveBeenCalledTimes(2)
  expect(read.mock.calls[1][0].aborted).toBe(false)
  await act(async () => pending.resolve(['second']))
  expect(result.current.data).toEqual(['second'])
})

it('pauses automatic work in hidden or offline tabs, including already queued refreshes', async () => {
  const read = vi.fn().mockResolvedValue([])
  const { result } = renderHook(() => useCalendarRead({ scopeKey: 'scope', read }))
  await advance(0)
  act(() => window.dispatchEvent(new Event('focus')))
  await advance(100)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  await advance(60000)
  expect(read).toHaveBeenCalledTimes(1)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  act(() => window.dispatchEvent(new Event('focus')))
  await advance(60000)
  expect(read).toHaveBeenCalledTimes(1)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  act(() => window.dispatchEvent(new Event('online')))
  await advance(100)
  expect(read).toHaveBeenCalledTimes(2)
  await act(async () => result.current.reload())
  expect(read).toHaveBeenCalledTimes(3)
})
