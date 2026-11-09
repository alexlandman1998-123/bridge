// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import useDevelopmentLeadRefresh from '../useDevelopmentLeadRefresh.js'
function Consumer({ refresh, scope = 'workspace', enabled = true }) { useDevelopmentLeadRefresh(refresh, scope, enabled); return null }
afterEach(() => { cleanup(); vi.useRealTimers() })
it('coalesces same-tab and cross-tab changes and uses the current authorised reader', async () => {
  vi.useFakeTimers()
  const oldRead = vi.fn(), read = vi.fn()
  const view = render(<Consumer refresh={oldRead} />)
  view.rerender(<Consumer refresh={read} />)
  act(() => {
    window.dispatchEvent(new Event('itg:developer-leads-changed'))
    window.dispatchEvent(new StorageEvent('storage', { key: 'bridge:buyer-lifecycle-refresh:v1' }))
  })
  await act(async () => vi.advanceTimersByTime(200))
  expect(read).toHaveBeenCalledOnce()
  expect(oldRead).not.toHaveBeenCalled()
})
it('cancels queued refreshes after switching scope or closing the screen', async () => {
  vi.useFakeTimers()
  const read = vi.fn()
  const view = render(<Consumer refresh={read} />)
  act(() => window.dispatchEvent(new Event('itg:developer-leads-changed')))
  view.rerender(<Consumer refresh={read} scope="another-workspace" enabled={false} />)
  await act(async () => vi.advanceTimersByTime(200))
  expect(read).not.toHaveBeenCalled()
  view.unmount()
  act(() => window.dispatchEvent(new Event('focus')))
  await act(async () => vi.advanceTimersByTime(200))
  expect(read).not.toHaveBeenCalled()
})
