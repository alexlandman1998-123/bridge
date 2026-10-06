// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { syncPrivateListingDistributionData } from '../privateListingService'
import { recordProperty24ListingSync } from '../../../server/services/property24ListingSyncService.js'

const mocks = vi.hoisted(() => ({ from: vi.fn(), writes: [] }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
const id = '11111111-1111-4111-8111-111111111111'
const allowed = new Set(['Draft', 'Live', 'Published', 'Removed', 'Expired'])

beforeEach(() => {
  mocks.writes = []
  mocks.from.mockReset()
  mocks.from.mockImplementation(table => {
    let payload = null
    const result = () => {
      const rows = Array.isArray(payload) ? payload : [payload]
      const invalid = table === 'listing_external_links' && rows.some(row => row && !allowed.has(row.status))
      return { data: payload, error: invalid ? { message: 'listing_external_links_status_check' } : null }
    }
    const query = {
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      maybeSingle: async () => result(),
      single: async () => result(),
    }
    for (const method of ['select', 'eq']) query[method] = () => query
    for (const method of ['insert', 'upsert', 'update', 'delete']) {
      query[method] = value => {
        payload = value ?? null
        mocks.writes.push({ table, method, payload })
        return query
      }
    }
    return query
  })
})

it.each([
  ['published', 'Published'], [' live ', 'Live'], ['active', 'Live'],
  ['draft', 'Draft'], ['removed', 'Removed'], ['paused', 'Removed'],
  ['inactive', 'Removed'], ['withdrawn', 'Removed'], ['expired', 'Expired'], ['submitted', 'Draft'],
  ['failed', 'Draft'], ['on_portal', 'Published'], ['', 'Draft'],
])('saves external links with database-compatible status %s', async (status, expected) => {
  const result = await syncPrivateListingDistributionData(id, {
    externalLinks: [{ platform: 'Property24', url: 'https://www.property24.com/andeon', status }],
  })
  expect(result.externalLinkCount).toBe(1)
  const insert = mocks.writes.find(write => write.table === 'listing_external_links' && write.method === 'insert')
  expect(insert.payload[0].status).toBe(expected)
})

it('rejects unknown statuses before changing publication data, media or existing links', async () => {
  await expect(syncPrivateListingDistributionData(id, {
    externalLinks: [{ platform: 'Other', url: 'https://example.com', status: 'unexpected' }],
  })).rejects.toThrow('External listing link status is invalid')
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.writes).toEqual([])
})

it.each([
  ['on_portal', true, 'Published'], ['submitted', false, 'Draft'],
  ['failed', false, 'Draft'], ['removed', false, 'Removed'], ['paused', false, 'Removed'],
])('records Property24 %s without a link constraint warning', async (externalStatus, isOnPortal, status) => {
  const result = await recordProperty24ListingSync({
    client: { from: mocks.from }, listingId: id, agencyId: 31382, listingNumber: 123,
    property24ListingUrl: 'https://www.property24.com/andeon', externalStatus, isOnPortal,
  })
  expect(result.externalLinkWarning).toBeNull()
  expect(result.externalLink).toMatchObject({ status, visible_to_seller: status === 'Published' })
})
