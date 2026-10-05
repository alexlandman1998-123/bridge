// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { getPrivateListing } from '../privateListingService'
const mocks = vi.hoisted(() => ({ from: vi.fn(), row: null }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
const id = '11111111-1111-4111-8111-111111111111'
const options = { includeRequirementsAndDocuments: false, includePreviousListings: true }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.row = { id, listing_category: 'rental', organisation_id: 'org-a', listing_status: 'withdrawn', listing_visibility: 'archived', seller_canonical_facts_json: { property24Import: { reference: 'HISTORIC' } } }
  mocks.from.mockImplementation(table => {
    const query = { then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject) }, maybeSingle: async () => ({ data: table === 'private_listings' ? mocks.row : null, error: null }) }
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'range', 'not', 'neq']) query[method] = vi.fn().mockReturnValue(query)
    return query
  })
})
it('loads saved historic rental details only when previous listings are requested', async () => {
  expect(await getPrivateListing(id, { includeRequirementsAndDocuments: false })).toBeNull()
  expect(await getPrivateListing(id, options)).toMatchObject({ id, listingCategory: 'rental', listingVisibility: 'archived' })
})
it.each([
  { deleted_at: '2026-10-05T10:00:00Z' },
  { is_deleted: true },
  { listing_status: 'deleted' },
  { listing_visibility: 'deleted' },
])('never reopens a deleted record: %o', async deleted => {
  mocks.row = { ...mocks.row, ...deleted }
  expect(await getPrivateListing(id, options)).toBeNull()
})
