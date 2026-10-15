import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { isTransientBuyerPortalReadError, recoverBuyerPortalLoad } from '../../lib/clientPortalReadRecovery.js'

const source = readFileSync(new URL('../ClientPortal.jsx', import.meta.url), 'utf8')
const prefix = 'const loadPortal = useCallback('
const start = source.indexOf(prefix)
const end = source.indexOf('\n  }, [isDemoRoute', start)
const handler = source.slice(start + prefix.length, end) + '\n  }'
const deadlines = source.slice(source.indexOf('const CLIENT_PORTAL_CORE_LOAD_TIMEOUT_MS'), source.indexOf('\nconst SELLER_PORTAL_MENU'))
afterEach(() => vi.useRealTimers())

function fixture({ load, section = 'overview', full = async () => { throw new Error('Unexpected full read') } }) {
  const states = [], errors = [], core = { legacyPortalData: { transaction: { id: 'transaction' } } }
  const read = vi.fn(options => options.mode === 'core' ? load(core) : full(core))
  const scope = {
    token: 'synthetic-buyer-link', isSellerPortalToken: false, isDemoRoute: false,
    sellerPortalAccessToken: '', portalDataWorkspace: 'buyer', requestedSection: section,
    portalLoadRequestRef: { current: 0 }, portalLoadScopeRef: { current: 'synthetic-buyer-link:buyer' }, portalContextsRef: { current: {} },
    getClientPortalWorkspaceData: (_token, _workspace, options) => read(options),
    recoverBuyerPortalLoad, isTransientBuyerPortalReadError,
    setBuyerPortalLoadRecoveryScope: value => states.push(['recoveryScope', value]),
    isSellerPortalAuthRequiredError: () => false,
    setError: message => { if (message) errors.push(message) },
    setDocumentActionError() {}, setSellerPortalAuth() {},
    setLoading: value => states.push(['loading', value]), setHydratingPortal: value => states.push(['hydrating', value]),
    setWorkspaceData: data => states.push(['workspace', data]), setPortal: data => states.push(['portal', data]),
    markRouteMilestone: name => states.push(['milestone', name]),
    getClientPortalLoadErrorMessage: error => error.message,
    selectStablePortalWorkspace: (_previous, next) => next,
  }
  const action = Function('scope', `with(scope) { ${deadlines}; return (${handler}); }`)(scope)
  return { action, read, states, errors, scope, core }
}

it('the actual buyer page recovers a failed cold read without showing Retry', async () => {
  vi.useFakeTimers()
  const load = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockImplementationOnce(core => core)
  const f = fixture({ load })
  const pending = f.action()
  await vi.advanceTimersByTimeAsync(650)
  await pending
  expect(load).toHaveBeenCalledTimes(2)
  expect(f.errors).toEqual([])
  expect(f.states).toContainEqual(['portal', f.core.legacyPortalData])
  expect(f.states).toContainEqual(['milestone', 'interactive_ready'])
})

it('the actual buyer page recovers an overall loading deadline automatically', async () => {
  vi.useFakeTimers()
  const load = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockImplementationOnce(core => core)
  const f = fixture({ load })
  const pending = f.action()
  await vi.advanceTimersByTimeAsync(30650)
  await pending
  expect(load).toHaveBeenCalledTimes(2)
  expect(f.errors).toEqual([])
  expect(f.states).toContainEqual(['loading', false])
})

it.each(['42501', 'PGRST301'])('buyer access failure %s is not retried or sent through a fallback loader', async code => {
  const load = vi.fn().mockRejectedValue(Object.assign(new Error('Access denied'), { code }))
  const f = fixture({ load })
  await f.action()
  expect(f.read).toHaveBeenCalledTimes(1)
  expect(f.errors).toEqual(['Access denied'])
  expect(f.states).toContainEqual(['portal', null])
})

it('navigation during recovery prevents another request and stale state changes', async () => {
  vi.useFakeTimers()
  const load = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
  const f = fixture({ load })
  const pending = f.action()
  await vi.advanceTimersByTimeAsync(1)
  f.scope.portalLoadScopeRef.current = 'another-link:buyer'
  const count = f.states.length
  await vi.runAllTimersAsync()
  await pending
  expect(load).toHaveBeenCalledTimes(1)
  expect(f.states).toHaveLength(count)
  expect(f.errors).toEqual([])
})

it('a failed full hydration retains the loaded portal and is not replayed', async () => {
  const full = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
  const f = fixture({ load: core => core, section: 'documents', full })
  await f.action()
  expect(full).toHaveBeenCalledTimes(1)
  expect(f.errors).toEqual([])
  expect(f.states).toContainEqual(['portal', f.core.legacyPortalData])
  expect(f.states).not.toContainEqual(['portal', null])
})

it('persistent connection failure enables automatic reconnect for only the current buyer scope', async () => {
  vi.useFakeTimers()
  const load = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
  const f = fixture({ load })
  const pending = f.action()
  await vi.runAllTimersAsync()
  await pending
  expect(load).toHaveBeenCalledTimes(2)
  expect(f.states).toContainEqual(['recoveryScope', 'synthetic-buyer-link:buyer'])
  expect(f.states).toContainEqual(['loading', false])
})
