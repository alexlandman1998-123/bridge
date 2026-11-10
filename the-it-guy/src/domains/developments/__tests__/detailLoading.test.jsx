// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDevelopmentDetailData } from '../useDevelopmentDetailData.js'
import { developmentDetailSectionsForTab } from '../detailSectionReadApi.js'

const mocks = vi.hoisted(() => ({ core: vi.fn(), summary: vi.fn(), section: vi.fn(), milestone: vi.fn() }))
vi.mock('../overviewReadApi.js', () => ({ fetchDevelopmentOverview: mocks.core, fetchDevelopmentOverviewPage: mocks.summary }))
vi.mock('../detailSectionReadApi.js', async original => ({ ...await original(), fetchDevelopmentDetailSection: mocks.section }))
vi.mock('../../../lib/performanceTrace', () => ({ markRouteMilestone: mocks.milestone }))
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const props = { developmentId: 'one', scopeKey: 'user:organisation:developer', enabled: true }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.core.mockImplementation(async id => ({ development: { id }, profile: {}, rows: [], settings: {} }))
  mocks.summary.mockResolvedValue({ overviewSummary: { totalUnits: 5000 } })
  mocks.section.mockResolvedValue({ documents: [{ id: 'document' }], developmentRequirements: [{ id: 'requirement' }] })
})
afterEach(cleanup)

it('makes the core interactive before optional data and deduplicates revisits and concurrent opens', async () => {
  const section = deferred()
  mocks.section.mockReturnValue(section.promise)
  const { result } = renderHook(() => useDevelopmentDetailData(props))
  await waitFor(() => expect(result.current.data?.development.id).toBe('one'))
  expect(result.current.loading).toBe(false)
  expect(mocks.core).toHaveBeenCalledWith('one')
  expect(mocks.section).not.toHaveBeenCalled()
  expect(mocks.milestone).toHaveBeenCalledWith('core_ready')
  expect(mocks.milestone).not.toHaveBeenCalledWith('interactive_ready')
  act(() => { void result.current.loadSections(['documents']); void result.current.loadSections(['documents']) })
  expect(result.current.sections.documents.status).toBe('loading')
  expect(result.current.data.documents).toBeUndefined()
  expect(mocks.section).toHaveBeenCalledTimes(1)
  await act(async () => section.resolve({ documents: [{ id: 'loaded' }] }))
  await act(async () => result.current.loadSections(['documents']))
  expect(mocks.section).toHaveBeenCalledTimes(1)
  expect(result.current.data.documents[0].id).toBe('loaded')
})

it('supports direct section links before the core arrives and retries failed reads locally', async () => {
  const core = deferred()
  mocks.core.mockReturnValue(core.promise)
  let offline = true
  mocks.section.mockImplementation(async (_id, section) => {
    if (section === 'financials' && offline) { offline = false; throw new Error('Offline') }
    return section === 'financials' ? { financials: { landCost: 44 } } : { inventoryLoaded: true }
  })
  const { result } = renderHook(() => useDevelopmentDetailData(props))
  await act(async () => result.current.loadSections(developmentDetailSectionsForTab('performance')))
  expect(mocks.section).not.toHaveBeenCalled()
  await act(async () => core.resolve({ development: { id: 'one' } }))
  await waitFor(() => expect(result.current.sections.financials?.status).toBe('error'))
  expect(result.current.error).toBe('')
  expect(result.current.data.development.id).toBe('one')
  await act(async () => result.current.loadSections(['financials']))
  expect(result.current.sections.financials.status).toBe('ready')
  expect(result.current.data.financials.landCost).toBe(44)
  expect(mocks.core).toHaveBeenCalledTimes(1)
})

it('refreshes opened sections, preserves the visible core and ignores superseded section responses', async () => {
  const oldRead = deferred()
  mocks.section.mockReturnValueOnce(oldRead.promise).mockResolvedValue({ documents: [{ id: 'fresh' }] })
  const { result } = renderHook(() => useDevelopmentDetailData(props))
  await waitFor(() => expect(result.current.data).not.toBeNull())
  act(() => { void result.current.loadSections(['documents']) })
  await act(async () => result.current.loadData())
  expect(result.current.data.documents[0].id).toBe('fresh')
  expect(mocks.section.mock.calls.map(([, section]) => section)).toEqual(['documents', 'documents'])
  await act(async () => oldRead.resolve({ documents: [{ id: 'stale' }] }))
  expect(result.current.data.documents[0].id).toBe('fresh')
  expect(result.current.loading).toBe(false)
})

it('never carries old route or permission-scope data into a new workspace', async () => {
  const oldRead = deferred()
  const newCore = deferred()
  const { result, rerender } = renderHook(values => useDevelopmentDetailData(values), { initialProps: props })
  await waitFor(() => expect(result.current.data?.development.id).toBe('one'))
  mocks.section.mockReturnValueOnce(oldRead.promise)
  act(() => { void result.current.loadSections(['documents']) })
  mocks.core.mockReturnValue(newCore.promise)
  rerender({ ...props, developmentId: 'two', scopeKey: 'another-user:another-org:agent' })
  expect(result.current.data).toBeNull()
  await act(async () => oldRead.resolve({ documents: [{ id: 'private-old-file' }] }))
  expect(result.current.data).toBeNull()
  await act(async () => newCore.resolve({ development: { id: 'two' } }))
  expect(result.current.data.development.id).toBe('two')
  expect(result.current.data.documents).toBeUndefined()
})

it('does not fetch when configuration is absent and rejects an older core refresh', async () => {
  const { result, rerender } = renderHook(values => useDevelopmentDetailData(values), { initialProps: { ...props, enabled: false } })
  expect(mocks.core).not.toHaveBeenCalled()
  const older = deferred()
  mocks.core.mockReturnValueOnce(older.promise).mockResolvedValue({ development: { id: 'newer' } })
  rerender(props)
  await act(async () => result.current.loadData())
  await act(async () => older.resolve({ development: { id: 'older' } }))
  expect(result.current.data.development.id).toBe('newer')
})

it('refreshes the bounded summary after edits without replacing complete inventory or unsaved metadata, and fences older replies', async () => {
  const first = deferred(), second = deferred()
  const { result } = renderHook(() => useDevelopmentDetailData(props))
  await waitFor(() => expect(result.current.data?.development.id).toBe('one'))
  act(() => result.current.setData(value => ({ ...value, rows: [{ unit: { id: 'edited' } }], inventoryLoaded: true })))
  const existing = result.current.data
  mocks.summary.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  act(() => { void result.current.refreshOverviewSummary(); void result.current.refreshOverviewSummary() })
  await act(async () => second.resolve({ overviewSummary: { totalUnits: 5000 }, overviewAttentionRows: [], overviewRecentRows: [] }))
  await act(async () => first.resolve({ overviewSummary: { totalUnits: 40 } }))
  expect(result.current.data.overviewSummary.totalUnits).toBe(5000)
  expect(result.current.data.rows).toBe(existing.rows)
  expect(result.current.data.settings).toBe(existing.settings)
  expect(result.current.data.development).toBe(existing.development)
  expect(mocks.core).toHaveBeenCalledTimes(1)
  expect(mocks.section).not.toHaveBeenCalled()
})

it('does not refresh closed inventory sections when the overview receives an update', async () => {
  mocks.section.mockResolvedValue({ inventoryLoaded: true, rows: [{ unit: { id: 'inventory' } }] })
  const { result } = renderHook(() => useDevelopmentDetailData(props))
  await waitFor(() => expect(result.current.data).not.toBeNull())
  await act(async () => result.current.setActiveSections(['inventory']))
  expect(mocks.section).toHaveBeenCalledTimes(1)
  await act(async () => result.current.setActiveSections([]))
  await act(async () => result.current.loadData())
  expect(mocks.section).toHaveBeenCalledTimes(1)
  await act(async () => result.current.setActiveSections(['inventory']))
  expect(mocks.section).toHaveBeenCalledTimes(2)
})

it('loads event scope separately, retries only events and rejects a superseded event response', async () => {
  const oldRead = deferred()
  mocks.core.mockResolvedValue({ development: { id: 'one', organisation_id: 'org' } })
  mocks.section.mockReturnValueOnce(oldRead.promise).mockResolvedValue({ marketingEvents: [{ id: 'fresh-event' }] })
  const { result } = renderHook(() => useDevelopmentDetailData(props))
  await waitFor(() => expect(result.current.data).not.toBeNull())
  act(() => { void result.current.loadSections(['marketingEvents']) })
  expect(mocks.section).toHaveBeenCalledWith('one','marketingEvents',{ organisationId: 'org' })
  await act(async () => result.current.loadSections(['marketingEvents'], { refresh: true }))
  expect(result.current.data.marketingEvents[0].id).toBe('fresh-event')
  await act(async () => oldRead.resolve({ marketingEvents: [] }))
  expect(result.current.data.marketingEvents[0].id).toBe('fresh-event')
  expect(mocks.core).toHaveBeenCalledTimes(1)
})
