import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: api.from } }))
import { createPrivateListingActivity } from '../privateListingService'
const listing = '11111111-1111-4111-8111-111111111111'
const identity = '22222222-2222-5222-8222-222222222222'
beforeEach(() => {
  vi.clearAllMocks()
  const query = { insert: payload => { api.insert(payload); return query }, select: () => query, single: async () => ({ data: { id: identity } }) }
  api.from.mockReturnValue(query)
})
it('sends the deterministic viewing identity to the existing database primary key', async () => {
  await createPrivateListingActivity({ privateListingId: listing, activityId: identity, activityType: 'rental_viewing_scheduled' })
  expect(api.insert.mock.calls[0][0]).toMatchObject({ id: identity, private_listing_id: listing })
})
it('keeps existing activity callers on the normal database-generated identity', async () => {
  await createPrivateListingActivity({ privateListingId: listing, activityType: 'note' })
  expect(api.insert.mock.calls[0][0]).not.toHaveProperty('id')
})
it('rejects an invalid explicit identity before attempting an insert', async () => {
  await expect(createPrivateListingActivity({ privateListingId: listing, activityId: 'invalid' })).rejects.toThrow('valid listing activity identity')
  expect(api.insert).not.toHaveBeenCalled()
})
