// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import usePortalWorkspaceRefresh from '../../hooks/usePortalWorkspaceRefresh.js'

const source = readFileSync(new NodeURL('../ClientPortal.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  const buyerPortalReconnecting =')
const end = source.indexOf('\n  useEffect(', start)
// Run the page's actual initial-entry refresh registration with the real hook.
const registration = Function('scope', `with(scope) { ${source.slice(start, end)}; return buyerPortalReconnecting; }`)
const scope = overrides => ({
  isDemoRoute: false, isSellerPortalToken: false, portal: null,
  buyerPortalLoadRecoveryScope: 'buyer-link:buyer:', portalLoadScopeRef: { current: 'buyer-link:buyer:' },
  loading: false, hydratingPortal: false, token: 'buyer-link', portalDataWorkspace: 'buyer',
  usePortalWorkspaceRefresh, loadPortal: vi.fn().mockResolvedValue(true), ...overrides,
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

it('a buyer left on the reconnect screen loads automatically when their connection returns', async () => {
  vi.useFakeTimers()
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const f = scope()
  renderHook(() => registration(f))
  expect(f.loadPortal).not.toHaveBeenCalled()
  online.mockReturnValue(true)
  await act(async () => {
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(400)
  })
  expect(f.loadPortal).toHaveBeenCalledExactlyOnceWith()
})

it('a visible failed buyer entry retries at the existing bounded polling interval', async () => {
  vi.useFakeTimers()
  const f = scope()
  renderHook(() => registration(f))
  await act(async () => { await vi.advanceTimersByTimeAsync(45400) })
  expect(f.loadPortal).toHaveBeenCalledExactlyOnceWith()
})

it.each([
  { isDemoRoute: true }, { isSellerPortalToken: true }, { portal: { transaction: { id: 'loaded' } } },
  { buyerPortalLoadRecoveryScope: '' }, { buyerPortalLoadRecoveryScope: 'old-link:buyer:' }, { loading: true },
])('does not reconnect a different or ineligible portal state: %j', async overrides => {
  vi.useFakeTimers()
  const f = scope(overrides)
  renderHook(() => registration(f))
  await act(async () => {
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(45400)
  })
  expect(f.loadPortal).not.toHaveBeenCalled()
})
