// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { useMemo } from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
afterEach(cleanup)
it('keeps a cached route buyer stable through unrelated renders and adopts the pinned hydration snapshot', () => {
  const source = readFileSync('src/pages/agency/AgencyPipelinePage.jsx', 'utf8')
  const start = source.indexOf('  const routeLeadSnapshotLead = useMemo(')
  const end = source.indexOf('  const selectedLeadRecord =', start)
  expect(start).toBeGreaterThan(-1)
  const select = new Function('context', `with(context) { ${source.slice(start, end)}; return routeLeadSnapshotLead; }`)
  const read = vi.fn(() => ({ leads: [{ leadId: 'buyer', stage: 'Qualified' }] }))
  const ref = { current: null }
  const context = { useMemo, isLeadWorkspaceRoute: true, organisationId: 'org', selectedLeadId: 'buyer', selectedLeadKey: 'buyer', routeLeadId: 'buyer', routeLeadHydrationStatus: 'loading', routeLeadWorkspaceSnapshotRef: ref, readLeadWorkspaceSessionSnapshot: read, normalizeLeadIdentityKey: value => value }
  const view = renderHook(() => select(context))
  const first = view.result.current
  view.rerender(); view.rerender(); view.rerender()
  expect(view.result.current).toBe(first)
  expect(read).toHaveBeenCalledTimes(1)
  ref.current = { leads: [{ leadId: 'buyer', stage: 'Viewing' }] }
  context.routeLeadHydrationStatus = 'ready'
  view.rerender()
  expect(view.result.current.stage).toBe('Viewing')
  expect(view.result.current).toBe(ref.current.leads[0])
  expect(read).toHaveBeenCalledTimes(1)
})
