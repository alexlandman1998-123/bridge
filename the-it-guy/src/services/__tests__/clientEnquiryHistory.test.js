import { beforeEach, expect, test, vi } from 'vitest'
import { buildClientEnquiryHistory } from '../../core/clients/clientEnquiryHistory'
import { loadClientEnquiryHistory } from '../clientEnquiryHistoryService'
import { supabase } from '../../lib/supabaseClient'
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: vi.fn() } }))
const lead = { lead_id: 'lead', organisation_id: 'agency', listing_id: 'listing', lead_source: 'Website', created_at: '2026-10-01T10:00:00Z' }
const log = (id, extra = {}) => ({ log_id: id, lead_id: 'lead', organisation_id: 'agency', status: 'processed', source: 'Property24', created_at: '2026-10-02T10:00:00Z', ...extra })
const history = (logs, leads = [lead]) => buildClientEnquiryHistory({ organisationId: 'agency', leads, logs, listings: [] })
beforeEach(() => vi.resetAllMocks())

test('counts genuine repeat enquiries on the same reused lead without adding the lead again', () => {
  const result = history([log('a', { external_reference: 'first' }), log('b', { external_reference: 'second' })])
  expect(result.count).toBe(2)
  expect(result.repeat).toBe(true)
})
test('excludes duplicate deliveries, duplicate reviews, failed and unprocessed records', () => {
  expect(history([log('a'), log('b', { status: 'duplicate' }), log('c', { duplicate_of_log_id: 'a' }), log('d', { review_status: 'duplicate' }), log('e', { status: 'failed' }), log('f', { status: 'new' })]).count).toBe(1)
  expect(history([log('a', { status: 'duplicate' })]).count).toBe(0)
})
test('deduplicates external references per source while keeping separate sources distinct', () => {
  expect(history([log('a', { external_reference: 'ref' }), log('b', { external_reference: 'ref' }), log('c', { external_reference: 'ref', source: 'Private Property' })]).count).toBe(2)
})
test('rejects other-organisation and unlinked evidence and uses a lead fallback only once', () => {
  expect(history([log('other', { organisation_id: 'other' }), log('unlinked', { lead_id: 'other' })], [lead, lead, { ...lead, lead_id: 'other', organisation_id: 'other' }]).count).toBe(1)
})
test('uses each enquiry property and sorts latest first', () => {
  const result = buildClientEnquiryHistory({ organisationId: 'agency', leads: [lead], logs: [log('a'), log('b', { listing_id: 'second', created_at: '2026-10-03T10:00:00Z' })], listings: [{ id: 'second', organisation_id: 'agency', title: 'Second property' }] })
  expect(result.enquiries[0].property).toBe('Second property')
  expect(result.enquiries[0].id).toBe('log:b')
})

test('reads authorised client links, scopes every query and reads later log pages', async () => {
  const calls = []
  const pages = {
    agency_client_links: [[{ source_id: 'lead' }]],
    leads: [[lead]],
    lead_ingestion_logs: [Array.from({ length: 500 }, (_, i) => log(String(i))), [log('last')]],
    private_listings: [[]],
  }
  supabase.from.mockImplementation(table => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn(() => query), order: vi.fn(() => query), range: vi.fn(async () => ({ data: pages[table].shift(), error: null })) }
    calls.push({ table, query }); return query
  })
  const result = await loadClientEnquiryHistory({ identityId: 'client', organisationId: 'agency' })
  expect(result.count).toBe(501)
  for (const { query } of calls) expect(query.eq).toHaveBeenCalledWith('organisation_id', 'agency')
  expect(calls[0].query.eq).toHaveBeenCalledWith('client_id', 'client')
  expect(calls.filter(call => call.table === 'lead_ingestion_logs').map(call => call.query.range.mock.calls[0])).toEqual([[0, 499], [500, 999]])
  expect(calls.find(call => call.table === 'lead_ingestion_logs').query.select.mock.calls[0][0]).not.toContain('payload')
})
test('a missing permanent profile never performs an identity search', async () => {
  expect((await loadClientEnquiryHistory({ organisationId: 'agency', email: 'same@example.test' })).available).toBe(false)
  expect(supabase.from).not.toHaveBeenCalled()
})
test('database read failures do not silently become zero enquiries', async () => {
  const query = { select: () => query, eq: () => query, order: () => query, range: async () => ({ error: new Error('Denied') }) }
  supabase.from.mockReturnValue(query)
  await expect(loadClientEnquiryHistory({ identityId: 'client', organisationId: 'agency' })).rejects.toThrow('Denied')
})
