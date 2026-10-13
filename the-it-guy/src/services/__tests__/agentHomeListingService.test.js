import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), analytics: vi.fn(), reads: [], interests: [], leads: [], forms: [], failedTable: '' }))
vi.mock('../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
vi.mock('../listings/listingOverviewPerformanceService.js', () => ({ getListingOverviewAnalytics: mocks.analytics }))
import { getAgentHomeListingSellerName, loadAgentHomeListingStats, summarizeAgentHomeListingViews } from '../agentHomeListingService.js'

const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const org = id(1), listingId = id(2), otherListingId = id(3)
const listings = [{ id: listingId, organisationId: org }, { id: otherListingId, organisationId: org }]
const metric = (value, complete = true) => ({ metrics: { views: { value, available: true, complete } } })
const analytics = () => ({ windowDays: 30, period: { completedDaysOnly: true, startDate: '2026-09-13', endDate: '2026-10-12' }, property24: metric(8), privateProperty: metric(4), website: metric(0) })

beforeEach(() => {
  Object.assign(mocks, { interests: [], leads: [], forms: [], failedTable: '' })
  mocks.reads.length = 0
  mocks.analytics.mockReset().mockImplementation(async () => analytics())
  mocks.from.mockReset().mockImplementation((table) => {
    const read = { table, scope: {} }
    const query = {
      select: (fields) => { read.fields = fields; return query },
      eq: (field, value) => { read.scope[field] = value; return query },
      in: (field, values) => { read.scope[field] = values; return query },
      or: (expression) => { read.expression = expression; return query },
      order: () => query,
      range: (start, end) => { read.range = [start, end]; return query },
      abortSignal: (signal) => { read.signal = signal; return query },
      then: (resolve) => {
        mocks.reads.push(read)
        let rows = table === 'leads' ? mocks.leads : table === 'lead_listing_interests' ? mocks.interests : mocks.forms
        if (table === 'leads') rows = rows.filter((lead) => read.scope.lead_id ? read.scope.lead_id.includes(lead.lead_id) : [lead.listing_id, lead.enquired_listing_id].some((value) => read.expression.includes(value) && value))
        return Promise.resolve({ data: rows.slice(read.range[0], read.range[1] + 1), error: mocks.failedTable === table ? new Error('Read failed') : null }).then(resolve)
      },
    }
    return query
  })
})

it('counts a new enquiry once per listing across direct and interest links, excluding seller and progressed leads', async () => {
  mocks.leads = [
    { lead_id: id(10), listing_id: listingId, stage: 'New Lead', lead_category: 'buyer' },
    { lead_id: id(11), enquired_listing_id: listingId, stage: 'Contacted', lead_category: 'buyer' },
    { lead_id: id(12), stage: 'new_lead', lead_category: 'buyer' },
    { lead_id: id(13), listing_id: listingId, stage: 'New Lead', lead_category: 'Seller' },
    { lead_id: id(14), listing_id: listingId, stage: 'New Lead', converted_transaction_id: id(50) },
    { lead_id: id(15), listing_id: listingId, stage: 'New Lead', status: 'Lost' },
    { lead_id: id(16), stage: 'New', lead_category: 'buyer' },
  ]
  mocks.interests = [
    { id: id(30), listing_id: listingId, lead_id: id(10), status: 'interested' },
    { id: id(31), listing_id: listingId, lead_id: id(12), status: 'interested' },
    { id: id(32), listing_id: otherListingId, lead_id: id(12), status: 'interested' },
    { id: id(33), listing_id: listingId, lead_id: id(16), status: 'dismissed' },
  ]
  const signal = new AbortController().signal
  const result = await loadAgentHomeListingStats({ organisationId: org, listings, signal })
  expect(result[listingId]).toMatchObject({ newLeads: 2, views: 12, partialViews: false })
  expect(result[otherListingId].newLeads).toBe(1)
  for (const read of mocks.reads) {
    expect(read.signal).toBe(signal)
    if (read.table !== 'private_listing_seller_onboarding') expect(read.scope.organisation_id).toBe(org)
    else expect(read.scope.private_listing_id).toEqual([listingId, otherListingId])
    expect(read.fields).not.toMatch(/phone|email|notes|token|\*/)
  }
})

it('keeps unavailable reads distinct from verified zero and keeps independent view counts', async () => {
  expect((await loadAgentHomeListingStats({ organisationId: org, listings }))[listingId].newLeads).toBe(0)
  mocks.failedTable = 'lead_listing_interests'
  mocks.analytics.mockRejectedValueOnce(new Error('Statistics failed'))
  const result = await loadAgentHomeListingStats({ organisationId: org, listings })
  expect(result[listingId]).toMatchObject({ newLeads: null, views: null })
  expect(result[otherListingId]).toMatchObject({ newLeads: null, views: 12 })
})

it('requires the completed 30-day period and labels missing channel coverage as partial', () => {
  expect(summarizeAgentHomeListingViews({ ...analytics(), website: {} })).toEqual({ views: 12, partialViews: true })
  expect(summarizeAgentHomeListingViews({ ...analytics(), property24: metric(0), privateProperty: metric(0) })).toEqual({ views: 0, partialViews: false })
  expect(summarizeAgentHomeListingViews({ ...analytics(), windowDays: 7 })).toEqual({ views: null, partialViews: false })
  expect(summarizeAgentHomeListingViews({ ...analytics(), period: { completedDaysOnly: false } }).views).toBeNull()
  expect(summarizeAgentHomeListingViews({ ...analytics(), property24: {}, privateProperty: {}, website: {} }).views).toBeNull()
})

it('reads all pages before reporting a lead count', async () => {
  mocks.leads = Array.from({ length: 1001 }, (_, index) => ({ lead_id: id(100 + index), listing_id: listingId, stage: 'New Lead' }))
  const result = await loadAgentHomeListingStats({ organisationId: org, listings: listings.slice(0, 1) })
  expect(result[listingId].newLeads).toBe(1001)
  expect(mocks.reads.filter((read) => read.table === 'leads').map((read) => read.range)).toEqual([[0, 999], [1000, 1999]])
})

it('rejects mismatched or malformed scopes and stops aborted work', async () => {
  expect(await loadAgentHomeListingStats({ organisationId: org, listings: [{ id: listingId, organisationId: id(60) }] })).toEqual({})
  expect(await loadAgentHomeListingStats({ organisationId: 'invalid', listings })).toEqual({})
  const controller = new AbortController()
  controller.abort()
  await expect(loadAgentHomeListingStats({ organisationId: org, listings, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.analytics).not.toHaveBeenCalled()
  expect(mocks.from).not.toHaveBeenCalled()
})

it('uses canonical seller names before onboarding fallbacks and never invents a seller', async () => {
  expect(getAgentHomeListingSellerName({ sellerCanonicalFacts: { seller: { first_name: 'Jane', surname: 'Smith' } } }, { sellerName: 'Old Seller' })).toBe('Jane Smith')
  mocks.forms = [{ id: id(70), private_listing_id: listingId, form_data: { sellerName: 'Jane Smith' } }]
  const result = await loadAgentHomeListingStats({ organisationId: org, listings })
  expect(result[listingId].sellerName).toBe('Jane Smith')
  expect(result[otherListingId].sellerName).toBe('Seller pending')
})
