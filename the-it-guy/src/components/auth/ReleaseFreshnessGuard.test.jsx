// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ReleaseFreshnessGuard from './ReleaseFreshnessGuard'
beforeEach(() => {
  vi.useFakeTimers()
  const meta = document.createElement('meta'); meta.name = 'arch9-release'; meta.content = 'test-release'; document.head.appendChild(meta)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ releaseId: 'test-release' }) })))
})
afterEach(() => { cleanup(); document.querySelector('meta[name="arch9-release"]')?.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('avoids all hidden/offline checks and reconciles when the tab returns', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  render(<ReleaseFreshnessGuard />)
  await act(async () => vi.advanceTimersByTimeAsync(600000))
  expect(fetch).not.toHaveBeenCalled()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  await act(async () => document.dispatchEvent(new Event('visibilitychange')))
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('prevents overlapping release requests and aborts the outstanding read on unmount', async () => {
  fetch.mockImplementation(() => new Promise(() => {}))
  const { unmount } = render(<ReleaseFreshnessGuard />)
  await act(async () => vi.advanceTimersByTimeAsync(600000))
  expect(fetch).toHaveBeenCalledTimes(1)
  const signal = fetch.mock.calls[0][1].signal
  unmount()
  expect(signal.aborted).toBe(true)
})
