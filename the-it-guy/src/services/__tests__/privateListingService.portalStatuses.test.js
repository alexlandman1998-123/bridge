// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { createPrivateListing, updatePrivateListing } from '../privateListingService'
import { buildPortalListingPayload } from '../../lib/listingDataMapper.js'
import { applyListingWithdrawalResults } from '../listings/listingWithdrawalModel.js'

const mocks = vi.hoisted(() => ({ from: vi.fn(), writes: [] }))
const ids = vi.hoisted(() => ({ listing: '11111111-1111-4111-8111-111111111111', org: '22222222-2222-4222-8222-222222222222', actor: '33333333-3333-4333-8333-333333333333' }))
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { from: mocks.from, auth: { getUser: async () => ({ data: { user: { id: ids.actor } } }) } },
}))
vi.mock('../suggestionGenerationService', () => ({ queueListingSuggestionGeneration: vi.fn() }))

const allowed = new Set(['not_published', 'draft', 'published', 'paused', 'removed'])
const options = { includeRequirementsAndDocuments: false, syncRequirements: false }
beforeEach(() => {
  mocks.writes = []
  mocks.from.mockReset()
  mocks.from.mockImplementation(table => {
    let payload
    const result = () => {
      const invalid = table === 'private_listings' && payload && ['property24_status', 'private_property_status', 'bridge_listing_status'].some(field => field in payload && !allowed.has(payload[field]))
      return {
        data: payload ? { id: ids.listing, organisation_id: ids.org, ...payload } : [],
        error: invalid ? { code: '23514', message: 'private_listings_private_property_status_check' } : null,
      }
    }
    const query = {
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      single: async () => result(),
      maybeSingle: async () => result(),
    }
    for (const method of ['select', 'eq', 'in', 'order']) query[method] = () => query
    for (const method of ['insert', 'update']) query[method] = value => {
      payload = value
      mocks.writes.push({ table, method, payload })
      return query
    }
    return query
  })
})

it.each([
  ['inactive', 'removed'], [' Withdrawn ', 'removed'], ['Expired', 'removed'],
  ['Active', 'published'], ['live', 'published'], ['on_portal', 'published'],
  ['submitted', 'draft'], ['processing', 'draft'], ['failed', 'draft'],
  ['Paused', 'paused'], ['published', 'published'], ['', 'not_published'],
])('creates and updates listings with database-compatible Private Property status %s', async (status, expected) => {
  const created = await createPrivateListing({ organisationId: ids.org, privatePropertyStatus: status }, options)
  expect(created.listing.privatePropertyStatus).toBe(expected)
  const updated = await updatePrivateListing(ids.listing, { privatePropertyStatus: status }, options)
  expect(updated.privatePropertyStatus).toBe(expected)
  const writes = mocks.writes.filter(write => write.table === 'private_listings')
  expect(writes.map(write => write.method)).toEqual(['insert', 'update'])
  expect(writes.every(write => write.payload.private_property_status === expected)).toBe(true)
})

it('saves the successful withdrawal outcomes for both portals', async () => {
  const draft = applyListingWithdrawalResults({}, [
    { key: 'private_property', status: 'succeeded' },
    { key: 'property24', status: 'succeeded' },
  ])
  const updated = await updatePrivateListing(ids.listing, draft, options)
  expect(updated.privatePropertyStatus).toBe('removed')
  expect(updated.property24Status).toBe('removed')
  expect(buildPortalListingPayload({ privatePropertyStatus: 'inactive', property24Status: 'expired' })).toMatchObject({ privatePropertyStatus: 'removed', property24Status: 'removed' })
})

it('keeps omitted statuses out of updates and preserves the creation defaults', async () => {
  await updatePrivateListing(ids.listing, { title: 'Updated title' }, options)
  const patch = mocks.writes.find(write => write.table === 'private_listings').payload
  expect(patch).not.toHaveProperty('private_property_status')
  const created = await createPrivateListing({ organisationId: ids.org }, options)
  expect(created.listing.privatePropertyStatus).toBe('not_published')
})

it.each(['privatePropertyStatus', 'property24Status', 'bridgeListingStatus'])('rejects an unknown %s before changing a listing', async field => {
  await expect(updatePrivateListing(ids.listing, { [field]: 'unexpected' }, options)).rejects.toThrow('listing status is invalid')
  await expect(createPrivateListing({ organisationId: ids.org, [field]: 'unexpected' }, options)).rejects.toThrow('listing status is invalid')
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.writes).toEqual([])
})
