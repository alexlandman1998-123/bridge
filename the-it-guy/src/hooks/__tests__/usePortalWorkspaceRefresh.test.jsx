// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import usePortalWorkspaceRefresh from '../usePortalWorkspaceRefresh'

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
const tick = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const options = onRefresh => ({ onRefresh, pollingIntervalMs: 15000, debounceMs: 100, refreshOnMount: true, scopeKey: 'one' })

it('does no network work while hidden or offline and refreshes on recovery', async () => {
  const read = vi.fn().mockResolvedValue(true)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  renderHook(() => usePortalWorkspaceRefresh(options(read)))
  await tick(600000)
  expect(read).not.toHaveBeenCalled()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  await tick(60000)
  expect(read).not.toHaveBeenCalled()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  act(() => window.dispatchEvent(new Event('online')))
  await tick(100)
  expect(read).toHaveBeenCalledTimes(1)
})

it('does not turn slow polling into continuous catch-up requests', async () => {
  let finish
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(true)
  renderHook(() => usePortalWorkspaceRefresh(options(read)))
  await tick(100)
  await tick(60000)
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { finish(true); await Promise.resolve() })
  await tick(100)
  expect(read).toHaveBeenCalledTimes(1)
  await tick(15000)
  expect(read).toHaveBeenCalledTimes(2)
})

it('coalesces focus and visibility bursts while retaining a genuine trailing recovery', async () => {
  let finish
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(true)
  renderHook(() => usePortalWorkspaceRefresh(options(read)))
  await tick(100)
  act(() => { for (let i = 0; i < 100; i++) { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) } })
  await tick(100)
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { finish(true); await Promise.resolve() })
  expect(read).toHaveBeenCalledTimes(2)
})

it('drops queued work on unmount and does not let an old scope update the new status', async () => {
  let finish
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(true)
  const { result, rerender, unmount } = renderHook(props => usePortalWorkspaceRefresh(props), { initialProps: options(read) })
  await tick(100)
  act(() => window.dispatchEvent(new Event('focus')))
  await tick(100)
  rerender({ ...options(read), scopeKey: 'two' })
  await tick(100)
  const latest = result.current.lastRefreshAt
  await act(async () => { finish(false); await Promise.resolve() })
  expect(result.current.lastRefreshAt).toBe(latest)
  expect(result.current.lastErrorMessage).toBe('')
  unmount()
  await tick(60000)
  expect(read).toHaveBeenCalledTimes(2)
})

it('reports failures and retries on the normal interval', async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(true)
  const { result } = renderHook(() => usePortalWorkspaceRefresh(options(read)))
  await tick(100)
  expect(result.current.lastErrorMessage).toContain('could not be refreshed')
  await tick(15000)
  expect(read).toHaveBeenCalledTimes(2)
  expect(result.current.lastErrorMessage).toBe('')
})
