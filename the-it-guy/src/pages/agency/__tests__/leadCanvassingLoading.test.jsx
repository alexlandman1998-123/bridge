// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { useCallback, useEffect } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const source = readFileSync('src/pages/agency/AgencyPipelinePage.jsx', 'utf8')
const start = source.indexOf('  const needsCanvassingContext =')
const end = source.indexOf('  useEffect(() => {\n    recordsRefreshMountedRef.current', start)
if (start < 0 || end < 0) throw new Error('Canvassing loading effects are missing')
const runEffects = new Function('useCallback', 'useEffect', 'context', `with(context) { ${source.slice(start, end)} }`)
const context = () => ({
  organisationId: 'org-one', loading: false, isLeadWorkspaceRoute: true, routeLeadRecord: null,
  listCanvassingWorkspace: vi.fn(async () => ({ prospects: [], activities: [] })),
  setCanvassingStore: vi.fn(), readCanvassingStore: vi.fn(() => ({})),
  normalizeText: value => String(value || '').trim(),
  getCanvassingStorageKey: org => `canvassing:${org}`,
  CANVASSING_UPDATED_EVENT: 'test:canvassing-updated',
})
const refresh = org => window.dispatchEvent(new CustomEvent('test:canvassing-updated', { detail: { organisationId: org } }))
beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers() })

it('does not load a canvassing directory for an ordinary lead, including refresh events', async () => {
  const state = context()
  state.routeLeadRecord = { leadId: 'buyer' }
  renderHook(() => runEffects(useCallback, useEffect, state))
  await act(async () => { refresh('org-one'); window.dispatchEvent(new StorageEvent('storage')); await vi.advanceTimersByTimeAsync(5000) })
  expect(state.listCanvassingWorkspace).not.toHaveBeenCalled()
})
it('loads linked prospect context after hydration and keeps refreshes scoped to its organisation', async () => {
  const state = context()
  const view = renderHook(() => runEffects(useCallback, useEffect, state))
  state.routeLeadRecord = { leadId: 'buyer', canvassingProspectId: 'prospect' }
  view.rerender()
  await act(async () => { await vi.advanceTimersByTimeAsync(750) })
  expect(state.listCanvassingWorkspace).toHaveBeenCalledExactlyOnceWith('org-one')
  await act(async () => { refresh('org-two') })
  expect(state.listCanvassingWorkspace).toHaveBeenCalledTimes(1)
  await act(async () => { refresh('org-one') })
  expect(state.listCanvassingWorkspace).toHaveBeenCalledTimes(2)
})
it('preserves the canvassing directory for list and calendar modes', async () => {
  const state = { ...context(), isLeadWorkspaceRoute: false }
  renderHook(() => runEffects(useCallback, useEffect, state))
  await act(async () => { await vi.advanceTimersByTimeAsync(750) })
  expect(state.listCanvassingWorkspace).toHaveBeenCalledExactlyOnceWith('org-one')
})
it('cancels scheduled directory requests when the workspace closes', async () => {
  const state = { ...context(), isLeadWorkspaceRoute: false }
  const view = renderHook(() => runEffects(useCallback, useEffect, state))
  view.unmount()
  await act(async () => { refresh('org-one'); await vi.advanceTimersByTimeAsync(5000) })
  expect(state.listCanvassingWorkspace).not.toHaveBeenCalled()
})
