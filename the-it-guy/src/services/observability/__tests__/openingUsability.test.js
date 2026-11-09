// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { openingRequestTrace, OPENING_REQUEST_HISTORY_KEY } from '../openingRequestTrace.js'
import { markRouteMilestone, markRouteRendered } from '../../../lib/performanceTrace.js'
afterEach(() => vi.unstubAllGlobals())

it('finishes at the usable-content frame, rather than the earlier shell render', () => {
  let time = 100, frame
  const storage = new Map()
  const windowApi = { location: { pathname: '/documents' }, requestAnimationFrame: callback => { frame = callback }, dispatchEvent: vi.fn(),
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, localStorage: { getItem: () => null } }
  vi.stubGlobal('window', windowApi)
  vi.stubGlobal('performance', { now: () => time, mark: vi.fn() })
  openingRequestTrace.begin('/documents', { startedAt: 0, force: true })
  markRouteRendered('/documents')
  expect(openingRequestTrace.report().usableMs).toBeNull()
  markRouteMilestone('interactive_ready')
  expect(openingRequestTrace.report().usableMs).toBeNull()
  time = 140; frame()
  expect(openingRequestTrace.report().usableMs).toBe(140)
  expect(JSON.parse(storage.get(OPENING_REQUEST_HISTORY_KEY)).at(-1).usableMs).toBe(140)
  time = 250; windowApi.location.pathname = '/pipeline/leads/private-id'
  markRouteRendered(windowApi.location.pathname)
  time = 300; markRouteMilestone('interactive_ready'); frame()
  expect(openingRequestTrace.report()).toMatchObject({ route: '/pipeline/leads/:id', usableMs: 50, timingOrigin: 'route_render' })
})
