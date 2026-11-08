import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), getPartner: vi.fn(), setPartner: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }))
vi.mock('../kingdomWebsitePublicationService', () => ({ getKingdomWebsitePublicationStatus: mocks.getPartner, setKingdomWebsitePublication: mocks.setPartner }))
import { getWebsiteListingPublicationStatus, getWebsiteListingPublicationStatuses as readBatch, setWebsiteListingPublication } from '../websiteListingPublicationService'

const kingdom = { websiteSiteId: '0160e45a-2268-4875-91d7-275c43f574d0', hostname: 'kingdomrealestate.co.za', websiteStatus: 'published', status: 'published', projectionStatus: 'Draft', available: true }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.rpc.mockResolvedValue({ data: { status: 'not_published', blockers: ['Create the organisation website before publishing a listing.'] } })
  mocks.getPartner.mockResolvedValue(kingdom)
  mocks.setPartner.mockResolvedValue(kingdom)
})
afterEach(() => vi.clearAllMocks())

it('uses the authorised Kingdom connection for iSell status and every publishing action', async () => {
  expect(await getWebsiteListingPublicationStatus('listing')).toMatchObject({ ...kingdom, websiteChannel: 'kingdom_website', websiteLabel: 'Kingdom Real Estate Website' })
  for (const action of ['publish', 'update', 'unpublish']) {
    await setWebsiteListingPublication('listing', action)
    expect(mocks.setPartner).toHaveBeenLastCalledWith('listing', action)
  }
  expect(mocks.invoke).not.toHaveBeenCalled()
})

it('keeps Kingdom-owned and other agency websites on the original publication service', async () => {
  mocks.rpc.mockResolvedValue({ data: { ...kingdom, projectionStatus: 'Published' } })
  mocks.invoke.mockResolvedValue({ data: { publication: kingdom } })
  await setWebsiteListingPublication('listing', 'publish')
  expect(mocks.invoke).toHaveBeenCalledWith('website-listing-publication', { body: { listingId: 'listing', action: 'publish' } })
  expect(mocks.getPartner).not.toHaveBeenCalled()
  expect(mocks.setPartner).not.toHaveBeenCalled()
})

it('does not infer a partner destination from a disconnected website or bypass a denied read', async () => {
  mocks.getPartner.mockResolvedValue({ available: false })
  expect(await getWebsiteListingPublicationStatus('listing')).toMatchObject({ websiteChannel: 'agency_website', status: 'not_published' })
  mocks.rpc.mockResolvedValue({ error: new Error('This listing is outside your active organisation.') })
  await expect(setWebsiteListingPublication('listing', 'publish')).rejects.toThrow(/outside your active organisation/)
  expect(mocks.invoke).not.toHaveBeenCalled()
  expect(mocks.setPartner).not.toHaveBeenCalled()
})

it('can inspect only the owned website without duplicating an authorised partner channel', async () => {
  expect(await getWebsiteListingPublicationStatus('listing', { includePartner: false })).toMatchObject({ websiteChannel: 'agency_website' })
  expect(mocks.getPartner).not.toHaveBeenCalled()
  await expect(setWebsiteListingPublication('listing', 'invalid')).rejects.toThrow(/valid website publication action/)
  expect(mocks.invoke).not.toHaveBeenCalled()
})

it('an explicit Agency Website action never redirects to the partner website if the agency connection disappears', async () => {
  mocks.invoke.mockResolvedValue({ error: new Error('The agency website is not connected.') })
  await expect(setWebsiteListingPublication('listing', 'publish', { includePartner: false })).rejects.toThrow('The agency website is not connected.')
  expect(mocks.getPartner).not.toHaveBeenCalled()
  expect(mocks.setPartner).not.toHaveBeenCalled()
  expect(mocks.invoke).toHaveBeenCalledWith('website-listing-publication', { body: { listingId: 'listing', action: 'publish' } })
})
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
it('reads 100 badges in one RPC, preserves channel labels and rejects unexpected/malformed rows', async () => {
  const ids = Array.from({ length: 100 }, (_, index) => id(index))
  mocks.rpc.mockResolvedValue({ data: [
    { listing_id: id(0), publication: kingdom, partner: true },
    { listing_id: id(1), publication: kingdom, partner: false },
    { listing_id: id(2), publication: null },
    { listing_id: id(3), publication: [] },
    { listing_id: id(4), publication: { available: false }, partner: true },
    { listing_id: 'not-requested', publication: kingdom, partner: true },
  ] })
  const statuses = await readBatch([...ids, id(0)])
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('website_get_listing_publication_statuses', { p_listing_ids: ids, p_include_partner: true })
  expect(statuses[id(0)]).toMatchObject({ ...kingdom, websiteChannel: 'kingdom_website' })
  expect(statuses[id(1)]).toMatchObject({ ...kingdom, websiteChannel: 'agency_website' })
  expect(Object.values(statuses).filter(Boolean)).toHaveLength(2)
  expect(Object.keys(statuses)).toHaveLength(100)
  expect(mocks.invoke).not.toHaveBeenCalled()
  expect(mocks.getPartner).not.toHaveBeenCalled()
})
it('falls back only for an absent RPC with at most four legacy reads running at once', async () => {
  let active = 0, maximum = 0
  const pending = []
  mocks.rpc.mockImplementation(name => {
    if (name.endsWith('_statuses')) return Promise.resolve({ error: { code: 'PGRST202' } })
    active += 1; maximum = Math.max(maximum, active)
    return new Promise(resolve => pending.push(() => { active -= 1; resolve({ data: kingdom }) }))
  })
  const request = readBatch(Array.from({ length: 6 }, (_, index) => id(index)))
  await Promise.resolve()
  expect(pending).toHaveLength(4)
  pending.splice(0).forEach(resolve => resolve())
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve()
  expect(pending).toHaveLength(2)
  pending.splice(0).forEach(resolve => resolve())
  expect(Object.values(await request).filter(Boolean)).toHaveLength(6)
  expect(maximum).toBe(4)
  expect(mocks.rpc).toHaveBeenCalledTimes(7)
})
it('does not multiply denied/network requests or invoke publishing actions', async () => {
  for (const code of ['42501', 'PGRST301', 'NETWORK']) {
    mocks.rpc.mockReset().mockResolvedValue({ error: { code, message: 'unavailable' } })
    await expect(readBatch([id(0)])).rejects.toMatchObject({ code })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  }
  expect(mocks.invoke).not.toHaveBeenCalled()
  expect(mocks.getPartner).not.toHaveBeenCalled()
  expect(mocks.setPartner).not.toHaveBeenCalled()
})
it('validates batch boundaries and preserves owned-only reads even with malformed partner data', async () => {
  expect(await readBatch([])).toEqual({})
  await expect(readBatch(['local'])).rejects.toThrow('100 saved')
  await expect(readBatch(Array.from({ length: 101 }, (_, index) => id(index)))).rejects.toThrow('100 saved')
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.rpc.mockResolvedValue({ data: [{ listing_id: id(0), publication: kingdom, partner: true }] })
  expect(await readBatch([id(0)], { includePartner: false })).toEqual({ [id(0)]: null })
  expect(mocks.rpc).toHaveBeenLastCalledWith('website_get_listing_publication_statuses', { p_listing_ids: [id(0)], p_include_partner: false })
  mocks.rpc.mockResolvedValue({ data: null })
  expect(await readBatch([id(0)])).toEqual({ [id(0)]: null })
})
it('rechecks publishing permissions afresh instead of reusing the batch destination', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: [{ listing_id: id(0), publication: kingdom, partner: true }] })
  await readBatch([id(0)])
  mocks.rpc.mockResolvedValueOnce({ error: new Error('Membership revoked') })
  await expect(setWebsiteListingPublication(id(0), 'publish')).rejects.toThrow('Membership revoked')
  expect(mocks.rpc).toHaveBeenLastCalledWith('website_get_listing_publication_status', { p_listing_id: id(0) })
  expect(mocks.setPartner).not.toHaveBeenCalled()
  expect(mocks.invoke).not.toHaveBeenCalled()
})
