import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), analytics: vi.fn(), reads: [] }))
vi.mock('../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
vi.mock('../listings/listingOverviewPerformanceService.js', () => ({ getListingOverviewAnalytics: mocks.analytics }))
import { loadDevelopmentListingPerformance } from '../developmentListingPerformanceService.js'

const orgA = '00000000-0000-4000-8000-000000000001'
const orgB = '00000000-0000-4000-8000-000000000002'
const idA = '00000000-0000-4000-8000-000000000011'
const idB = '00000000-0000-4000-8000-000000000012'
const listings = [{ id: idA, organisationId: orgA }, { id: idB, organisationId: orgB }]
beforeEach(() => {
  mocks.reads.length = 0
  mocks.analytics.mockReset().mockImplementation(async ({ days }) => ({ windowDays: days, period: { completedDaysOnly: true, startDate: '2026-09-09', endDate: '2026-10-08' }, property24: { metrics: { views: { value: 50, available: true, complete: true, coveredDays: days } } } }))
  mocks.from.mockReset().mockImplementation(table => {
    const read = { table, scope: {}, fields: '' }
    const query = {
      select: fields => { read.fields = fields; return query },
      eq: (key, value) => { read.scope[key] = value; return query },
      in: (key, values) => { read.scope[key] = values; return query },
      or: expression => { read.expression = expression; return query },
      ilike: () => query, order: () => query,
      range: (start, end) => { read.range = [start, end]; return query },
      abortSignal: async signal => { read.signal = signal; mocks.reads.push(read); return { data: [], error: null } },
    }
    return query
  })
})

it('reads each listing using its owning organisation, retaining a verified zero and a single total', async () => {
  const signal = new AbortController().signal
  const result = await loadDevelopmentListingPerformance([...listings, listings[0]], 30, signal)
  expect(mocks.analytics).toHaveBeenCalledTimes(2)
  expect(mocks.analytics.mock.calls.map(([args]) => [args.organisationId, args.listingId])).toEqual([[orgA, idA], [orgB, idB]])
  expect(result.property24.metrics.views.value).toBe(100)
  expect(result.property24.metrics.views.complete).toBe(true)
  expect(result.leadCount).toBe(0)
  expect(result.leadsComplete).toBe(true)
  expect(mocks.reads).toHaveLength(6)
  for (const read of mocks.reads) {
    expect([orgA, orgB]).toContain(read.scope.organisation_id)
    expect(read.signal).toBe(signal)
    expect(read.fields).not.toMatch(/email|phone|name|notes|\*/)
    const id = read.scope.organisation_id === orgA ? idA : idB
    if (read.expression) expect(read.expression).toBe(`listing_id.in.(${id}),enquired_listing_id.in.(${id})`)
    else expect(read.scope.listing_id).toEqual([id])
  }
})

it('keeps unavailable organisations out of reads and marks their counts partial', async () => {
  mocks.analytics.mockImplementation(async ({ organisationId, days }) => {
    if (organisationId === orgB) throw new Error('Not authorised')
    return { windowDays: days, period: { completedDaysOnly: true, startDate: '2026-09-09', endDate: '2026-10-08' }, property24: { metrics: { views: { value: 8, available: true, complete: true } } } }
  })
  const result = await loadDevelopmentListingPerformance(listings, 30, new AbortController().signal)
  expect(mocks.reads.every(read => read.scope.organisation_id === orgA)).toBe(true)
  expect(result.property24.metrics.views.value).toBe(8)
  expect(result.property24.metrics.views.complete).toBe(false)
  expect(result.leadsComplete).toBe(false)
  expect(result.unavailableListingCount).toBe(1)
})

it('rejects malformed scope and an obsolete statistics period without inventing zero counts', async () => {
  const invalid = await loadDevelopmentListingPerformance([{ id: 'invalid', organisationId: orgA }], 30)
  expect(mocks.analytics).not.toHaveBeenCalled()
  expect(invalid.leadsAvailable).toBe(false)
  mocks.analytics.mockResolvedValue({ windowDays: 30, period: { completedDaysOnly: false } })
  const result = await loadDevelopmentListingPerformance(listings, 30)
  expect(mocks.from).not.toHaveBeenCalled()
  expect(result.leadsAvailable).toBe(false)
  expect(result.property24.metrics.views.available).toBe(false)
})

it('stops stale reads when the selected period is cancelled', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(loadDevelopmentListingPerformance(listings, 7, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.analytics).not.toHaveBeenCalled()
  expect(mocks.from).not.toHaveBeenCalled()
})
