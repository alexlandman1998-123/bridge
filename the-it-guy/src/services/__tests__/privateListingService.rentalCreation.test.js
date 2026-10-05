import { beforeEach, expect, it, vi } from 'vitest'
import { createPrivateListing } from '../privateListingService'

const mocks = vi.hoisted(() => ({ row: null, insertCount: 0, loseResponse: false }))
const ids = vi.hoisted(() => ({ listing: '11111111-1111-4111-8111-111111111111', actor: '22222222-2222-4222-8222-222222222222', org: '33333333-3333-4333-8333-333333333333' }))
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true, DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: ids.actor } } }) },
    from(table) {
      if (table !== 'private_listings') throw new Error('Optional post-creation read unavailable')
      let inserted
      return {
        select() { return this }, eq() { return this },
        async maybeSingle() { return { data: mocks.row } },
        insert(row) { inserted = row; return this },
        async single() {
          mocks.insertCount += 1
          mocks.row = { ...inserted, updated_at: '2026-10-04T00:00:00Z' }
          return mocks.loseResponse ? { error: new Error('Response lost') } : { data: mocks.row }
        },
      }
    },
  },
}))
vi.mock('../suggestionGenerationService', () => ({ queueListingSuggestionGeneration: vi.fn() }))
beforeEach(() => { mocks.row = null; mocks.insertCount = 0; mocks.loseResponse = false })

it('uses the reserved ID in the real creation entry point and reuses a committed insert after a lost response', async () => {
  mocks.loseResponse = true
  const onListingCreated = vi.fn()
  const payload = { organisationId: ids.org, assignedAgentId: ids.actor, listingCategory: 'rental', title: 'Original rental' }
  const options = { rentalCreationId: ids.listing, includeRequirementsAndDocuments: false, syncRequirements: false, onListingCreated }
  const first = await createPrivateListing(payload, options)
  expect(first).toMatchObject({ existing: true, listing: { id: ids.listing, title: 'Original rental' } })
  expect(onListingCreated).toHaveBeenCalledWith(ids.listing, expect.objectContaining({ id: ids.listing }))
  const second = await createPrivateListing({ ...payload, title: 'Stale retry' }, options)
  expect(second.listing.title).toBe('Original rental')
  expect(mocks.insertCount).toBe(1)
})
