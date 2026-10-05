import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteRentalListing, inspectRentalListingDeletion } from '../rentalListingDeletionService'
const mocks = vi.hoisted(() => ({ listing: vi.fn(), activity: vi.fn(), delete: vi.fn(), cascade: vi.fn(), portal: vi.fn(), website: vi.fn(), kingdom: vi.fn() }))
vi.mock('../../privateListingService', () => ({ getPrivateListing: mocks.listing, getPrivateListingActivity: mocks.activity, deletePrivateListing: mocks.delete }))
vi.mock('../../../lib/agentListingStorage', () => ({ deleteAgentPrivateListingCascade: mocks.cascade }))
vi.mock('../../websiteListingPublicationService', () => ({ getWebsiteListingPublicationStatus: mocks.website }))
vi.mock('../../kingdomWebsitePublicationService', () => ({ getKingdomWebsitePublicationStatus: mocks.kingdom }))
vi.mock('../rentalListingChannelService', () => ({ getRentalPortalStatus: mocks.portal }))
vi.mock('../rentalListingDraftService', () => ({ isRentalListingRecord: listing => listing.listingCategory === 'rental' }))
const listing = { id: 'rental-1', organisationId: 'org-1', listingCategory: 'rental', property24Status: 'not_published', privatePropertyStatus: 'not_published', listingPublicationData: {}, sellerCanonicalFacts: {} }
const options = { organisationId: 'org-1' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.listing.mockResolvedValue(listing); mocks.activity.mockResolvedValue([])
  mocks.website.mockResolvedValue({ status: 'not_published' }); mocks.kingdom.mockResolvedValue({ available: false })
  mocks.delete.mockResolvedValue({ deleted: true, listing: { id: listing.id } })
})
describe('rental deletion follows withdrawal first', () => {
  it('deletes an unpublished draft through the shared verified delete, then removes its local projection', async () => {
    await deleteRentalListing(listing.id, options)
    expect(mocks.portal).not.toHaveBeenCalled()
    expect(mocks.delete).toHaveBeenCalledWith(listing.id, { organisationId: 'org-1', listingReference: undefined })
    expect(mocks.cascade).toHaveBeenCalledOnce()
  })
  it('blocks live P24 even when the saved status says withdrawn', async () => {
    mocks.listing.mockResolvedValue({ ...listing, property24Reference: '123', property24Status: 'withdrawn' })
    mocks.portal.mockResolvedValue({ lifecycle: { state: 'withdrawn', isOnPortal: true } })
    await expect(deleteRentalListing(listing.id, options)).rejects.toThrow(/Withdraw/)
    expect(mocks.delete).not.toHaveBeenCalled()
  })
  it('blocks active PP and either published website', async () => {
    mocks.listing.mockResolvedValue({ ...listing, privatePropertyReference: '456' })
    mocks.portal.mockResolvedValue({ monitor: { externalStatus: 'ToLet' } })
    mocks.website.mockResolvedValue({ status: 'published' }); mocks.kingdom.mockResolvedValue({ available: true, status: 'published' })
    const result = await inspectRentalListingDeletion(listing.id, options)
    expect(result.liveChannels).toEqual(['Private Property', 'Agency Website', 'Kingdom Website'])
    expect(result.canDelete).toBe(false)
  })
  it('permits deletion only after portal removal is confirmed', async () => {
    mocks.listing.mockResolvedValue({ ...listing, property24Reference: '123', property24Status: 'withdrawn', privatePropertyReference: '456', privatePropertyStatus: 'inactive' })
    mocks.portal.mockImplementation(async (_id, channel) => channel === 'property24' ? { lifecycle: { state: 'withdrawn', isOnPortal: false } } : { monitor: { externalStatus: 'Inactive' } })
    await deleteRentalListing(listing.id, options)
    expect(mocks.portal).toHaveBeenCalledWith(listing.id, 'property24', { refresh: true })
    expect(mocks.delete).toHaveBeenCalledOnce()
  })
  it('blocks a contradictory PP active-list result even when its status says inactive', async () => {
    mocks.listing.mockResolvedValue({ ...listing, privatePropertyReference: '456', privatePropertyStatus: 'inactive' })
    mocks.portal.mockResolvedValue({ monitor: { externalStatus: 'inactive', statusProbe: { activeListing: { uniqueId: listing.id } } } })
    await expect(deleteRentalListing(listing.id, options)).rejects.toThrow(/Withdraw/)
    expect(mocks.delete).not.toHaveBeenCalled()
  })
  it('rechecks current publication before deletion instead of trusting an earlier inspection', async () => {
    expect((await inspectRentalListingDeletion(listing.id, options)).canDelete).toBe(true)
    mocks.website.mockResolvedValue({ status: 'published' })
    await expect(deleteRentalListing(listing.id, options)).rejects.toThrow(/Withdraw/)
    expect(mocks.website).toHaveBeenCalledTimes(2)
    expect(mocks.delete).not.toHaveBeenCalled()
  })
  it('blocks unknown, pending and failed status checks instead of assuming removal', async () => {
    mocks.listing.mockResolvedValue({ ...listing, property24Reference: '123' })
    for (const response of [{}, { lifecycle: { state: 'pending', isOnPortal: false } }, { status: 'UNCERTAIN', lifecycle: { state: 'withdrawn' } }]) {
      mocks.portal.mockResolvedValue(response)
      await expect(deleteRentalListing(listing.id, options)).rejects.toThrow(/Confirm removal/)
    }
    mocks.portal.mockRejectedValue(new Error('offline'))
    await expect(deleteRentalListing(listing.id, options)).rejects.toThrow(/Confirm removal/)
    expect(mocks.delete).not.toHaveBeenCalled()
  })
  it('keeps browser data when the server refuses or fails to confirm deletion', async () => {
    mocks.delete.mockRejectedValue(new Error('Linked workflow'))
    await expect(deleteRentalListing(listing.id, options)).rejects.toThrow('Linked workflow')
    mocks.delete.mockResolvedValue({ deleted: false })
    await expect(deleteRentalListing(listing.id, options)).rejects.toThrow(/could not be confirmed/)
    expect(mocks.cascade).not.toHaveBeenCalled()
  })
  it('rejects stale workspace identities, non-rentals and failed current reads', async () => {
    mocks.listing.mockResolvedValue({ ...listing, organisationId: 'another-org' })
    await expect(deleteRentalListing(listing.id, options)).rejects.toThrow(/current workspace/)
    mocks.listing.mockResolvedValue({ ...listing, listingCategory: 'sale' })
    await expect(deleteRentalListing(listing.id, options)).rejects.toThrow(/current workspace/)
    mocks.listing.mockRejectedValue(new Error('read denied'))
    await expect(deleteRentalListing(listing.id, options)).rejects.toThrow('read denied')
    expect(mocks.delete).not.toHaveBeenCalled()
  })
})
