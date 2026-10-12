// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useSellerOnboardingCompletionPolling from '../useSellerOnboardingCompletionPolling'

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
const options = onPoll => ({ enabled: true, pollingKey: 'org/lead/listing', onPoll })
const settle = () => act(async () => { await Promise.resolve() })

it('bounds reads despite 1,000 fresh snapshots and focus events, using the latest callback', async () => {
  const read = vi.fn().mockResolvedValue(true)
  const { rerender } = renderHook(props => useSellerOnboardingCompletionPolling(props), { initialProps: options(() => read('first')) })
  await settle()
  for (let i = 0; i < 1000; i++) {
    rerender(options(() => read(`snapshot-${i}`)))
    act(() => window.dispatchEvent(new Event('focus')))
  }
  expect(read).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(6999))
  expect(read).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(read).toHaveBeenCalledTimes(2)
  expect(read).toHaveBeenLastCalledWith('snapshot-999')
})

it('never overlaps a slow request and waits seven seconds after its completion', async () => {
  let finish
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(true)
  renderHook(() => useSellerOnboardingCompletionPolling(options(read)))
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  act(() => window.dispatchEvent(new Event('focus')))
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { finish(true); await Promise.resolve() })
  await act(() => vi.advanceTimersByTimeAsync(6999))
  expect(read).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(read).toHaveBeenCalledTimes(2)
})

it('aborts the old lead, rejects its stale result, and preserves ownership until it settles', async () => {
  let finish
  let oldContext
  let staleApplied = false
  const oldRead = vi.fn(async context => {
    oldContext = context
    await new Promise(resolve => { finish = resolve })
    if (context.isCurrent()) staleApplied = true
    return true
  })
  const nextRead = vi.fn().mockResolvedValue(true)
  const { rerender } = renderHook(props => useSellerOnboardingCompletionPolling(props), { initialProps: options(oldRead) })
  rerender({ ...options(nextRead), pollingKey: 'org/other-lead/other-listing' })
  expect(oldContext.signal.aborted).toBe(true)
  expect(oldContext.isCurrent()).toBe(false)
  await act(() => vi.advanceTimersByTimeAsync(14_000))
  expect(nextRead).not.toHaveBeenCalled()
  await act(async () => { finish(); await Promise.resolve() })
  expect(staleApplied).toBe(false)
  await act(() => vi.advanceTimersByTimeAsync(7000))
  expect(nextRead).toHaveBeenCalledTimes(1)
})

it('pauses while hidden and cannot bypass the cooldown by disabling and re-enabling', async () => {
  const read = vi.fn().mockResolvedValue(true)
  const { rerender } = renderHook(props => useSellerOnboardingCompletionPolling(props), { initialProps: options(read) })
  await settle()
  rerender({ ...options(read), enabled: false })
  rerender(options(read))
  expect(read).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  expect(read).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve() })
  expect(read).toHaveBeenCalledTimes(2)
})

it('stops polling after completion and clears all timers on unmount', async () => {
  const read = vi.fn().mockResolvedValue(false)
  const { unmount } = renderHook(() => useSellerOnboardingCompletionPolling(options(read)))
  await settle()
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  act(() => window.dispatchEvent(new Event('focus')))
  expect(read).toHaveBeenCalledTimes(1)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps Strict Mode cleanup from creating duplicate requests and retries errors at the normal interval', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const read = vi.fn().mockRejectedValueOnce(new Error('temporary outage')).mockResolvedValue(true)
  const { unmount } = renderHook(() => useSellerOnboardingCompletionPolling(options(read)), { wrapper: StrictMode })
  await settle()
  expect(read).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(7000))
  expect(read).toHaveBeenCalledTimes(2)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
  expect(warn).not.toHaveBeenCalled() // The failed Strict Mode request was cancelled.
})
