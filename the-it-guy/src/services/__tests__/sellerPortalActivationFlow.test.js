import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ listing: vi.fn(), prepare: vi.fn(), invite: vi.fn(), email: vi.fn(), activity: vi.fn(), update: vi.fn(), onboarding: vi.fn() }))
vi.mock('../privateListingService', () => ({ getPrivateListing: mocks.listing, ensureSellerPortalActivationRecord: mocks.prepare, issueSellerPortalInvite: mocks.invite, sendSellerOnboarding: mocks.onboarding, updatePrivateListing: mocks.update, createPrivateListingActivity: mocks.activity }))
vi.mock('../../lib/supabaseClient', () => ({ invokeEdgeFunction: mocks.email }))
import { activateSellerPortalForListing } from '../sellerPortalActivationService.js'

const input = { listingId: 'listing-fixture', sellerContactEmail: 'seller@example.test', sellerFirstName: 'Ada', sellerSurname: 'Seller', listingCreated: true, organisationId: 'agency-fixture' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.listing.mockResolvedValue({ id: input.listingId, sellerType: 'individual', sellerCanonicalFacts: { seller: { legal_type: 'individual' }, firstName: 'Ada', lastName: 'Seller' }, seller: { name: 'Ada Seller', email: input.sellerContactEmail }, sellerOnboardingStatus: 'completed', organisationId: input.organisationId, title: 'Fixture home' })
  mocks.prepare.mockResolvedValue({ stablePortalToken: 'stable-fixture-token' })
  mocks.invite.mockResolvedValue({ inviteToken: 'short-lived-invite', stablePortalToken: 'stable-fixture-token', inviteExpiresAt: '2030-01-01T00:00:00Z' })
  mocks.email.mockResolvedValue({ data: { sent: true, deliveryId: 'fixture-delivery' } })
  mocks.activity.mockResolvedValue({})
  mocks.update.mockResolvedValue({})
})
it('connects the saved listing to a short-lived invitation and the seller portal route', async () => {
  const result = await activateSellerPortalForListing(input)
  expect(mocks.listing).toHaveBeenCalledWith(input.listingId, { includeRequirementsAndDocuments: false })
  expect(mocks.invite).toHaveBeenCalledWith('stable-fixture-token', { ttlHours: 72 })
  expect(mocks.email).toHaveBeenCalledWith('send-email', { body: expect.objectContaining({ type: 'seller_portal_link', to: input.sellerContactEmail, organisationId: input.organisationId, listingId: input.listingId, portalLink: 'https://app.arch9.co.za/client/short-lived-invite/selling' }) })
  expect(result.ok).toBe(true)
  expect(result.portalLink).not.toContain('stable-fixture-token')
  expect(mocks.update).toHaveBeenCalledWith(input.listingId, { sellerOnboardingStatus: 'completed' }, { includeRequirementsAndDocuments: false })
  expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ privateListingId: input.listingId, metadata: expect.objectContaining({ deliveryId: 'fixture-delivery' }) }))
})
it('stops missing seller setup before creating an invitation or sending mail', async () => {
  mocks.listing.mockResolvedValue({ id: input.listingId, sellerType: 'unknown' })
  await expect(activateSellerPortalForListing(input)).rejects.toMatchObject({ code: 'seller_type_required' })
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.invite).not.toHaveBeenCalled(); expect(mocks.email).not.toHaveBeenCalled()
})
it('does not claim the portal link was sent when delivery fails', async () => {
  mocks.email.mockResolvedValue({ data: { error: 'Delivery unavailable' } })
  await expect(activateSellerPortalForListing(input)).rejects.toThrow('Delivery unavailable')
  expect(mocks.activity).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
})
it('requires a usable invite token before sending anything', async () => {
  mocks.invite.mockResolvedValue({ stablePortalToken: 'stable-fixture-token' })
  await expect(activateSellerPortalForListing(input)).rejects.toThrow(/invitation link/)
  expect(mocks.email).not.toHaveBeenCalled()
})
