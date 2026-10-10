import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), getPartner: vi.fn(), setPartner: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }))
vi.mock('../kingdomWebsitePublicationService', () => ({ getKingdomWebsitePublicationStatus: mocks.getPartner, setKingdomWebsitePublication: mocks.setPartner }))
import { getWebsiteListingPublicationStatus, setWebsiteListingPublication } from '../websiteListingPublicationService'

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
