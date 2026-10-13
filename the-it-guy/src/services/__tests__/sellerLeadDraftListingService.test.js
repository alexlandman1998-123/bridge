import { expect, test, vi } from 'vitest'
import { createSellerLeadDraftListing, hasSellerLeadDraftAddress } from '../sellerLeadDraftListingService'
import { buildSellerLeadListingPrefill } from '../../lib/sellerLeadListingPrefill.js'
import { isUnconvertedSellerLeadIntake, isUnpublishedDraftListing } from '../../lib/sellerLeadListingBoundary.js'

function fixture(formData = { propertyAddress: '1 Example Road' }) {
  let row = { id: 'listing-1', organisationId: 'org-1', originatingCrmLeadId: 'lead-1', sellerLeadId: 'lead-1',
    updatedAt: '2026-10-13T10:00:00Z',
    listingSource: 'seller_lead_intake', listingStatus: 'seller_lead', mandateStatus: 'not_started',
    sellerOnboarding: { id: 'onboarding-1', token: 'token-1', status: 'in_progress', updatedAt: '2026-10-13T10:00:00Z', formData } }
  const api = {
    getPrivateListing: vi.fn(async () => structuredClone(row)),
    updatePrivateListing: vi.fn(async (id, patch) => { row = { ...row, ...patch } }),
    syncPrivateListingDistributionData: vi.fn(async (id, value) => { row.listingPublicationData = value.publicationData; return { listing: row } }),
    updateAgencyCrmLeadRecord: vi.fn(async () => ({})),
    persistSellerProfileOnboardingFormData: vi.fn(), createPrivateListing: vi.fn(),
  }
  const run = () => createSellerLeadDraftListing({ organisationId: 'org-1', lead: { leadId: 'lead-1', listingId: 'listing-1', sellerOnboarding: { formData: { propertyAddress: 'Old address', bedrooms: 9, email: 'old@example.test' } } } }, api)
  return { api, run, read: () => row }
}

test('an address alone promotes the same intake to an unpublished draft without changing seller or mandate state', async () => {
  const { run, read, api } = fixture()
  const before = structuredClone(read().sellerOnboarding)
  const result = await run()
  expect(result.listing.id).toBe('listing-1')
  expect(read().sellerOnboarding).toEqual(before)
  expect(read()).toMatchObject({ listingSource: 'private_listing', listingStatus: 'listing_review', mandateStatus: 'not_started', listingVisibility: 'internal', isActive: false })
  expect(isUnconvertedSellerLeadIntake(read())).toBe(false)
  expect(isUnpublishedDraftListing(read())).toBe(true)
  expect(api.createPrivateListing).not.toHaveBeenCalled()
  expect(api.persistSellerProfileOnboardingFormData).not.toHaveBeenCalled()
  expect(api.updatePrivateListing.mock.calls[0][2]).toMatchObject({ expectedListingSource: 'seller_lead_intake', expectedUpdatedAt: '2026-10-13T10:00:00Z' })
})

test('all seller facts remain identical and property characteristics reach the listing marketing fields', async () => {
  const profile = { propertyAddress: '1 Example Road', sellerFirstName: 'Sam', email: '', ownershipType: 'trust',
    trustees: [{ id: 'person-1', name: 'Sam', surname: 'Ngwenya', email: 'sam@example.test' }],
    trustName: 'Example Trust', trustRegistrationNumber: 'IT00001/2026', authorisedTrusteeName: 'Sam Ngwenya',
    bedrooms: 0, bathrooms: 2.5, garages: 0, parkingCovered: 1, parkingOpen: 2, floorSize: 140, erfSize: 900,
    ratesTaxes: 0, levies: 1250, features: ['solar'], propertyDisclosure: { responses: { roof: { answer: 'unsure' } } },
    sellerReviewedDocumentVersions: { documents: [{ versionId: 'immutable-version', html: 'Original signed facts' }] } }
  const { run, read } = fixture(profile)
  await run()
  expect(read().sellerOnboarding.formData).toEqual(profile)
  expect(read().listingPublicationData).toMatchObject({ bedrooms: 0, bathrooms: 2.5, garages: 0, parkingBays: 3, floorSize: 140, erfSize: 900, ratesTaxes: 0, levies: 1250, status: 'Draft' })
  expect(read().listingPublicationData.features).toContain('solar')
})

test('repeated create does not overwrite an existing draft or create a second record', async () => {
  const { run, read, api } = fixture({ propertyAddress: '1 Example Road', bedrooms: 3 })
  await run()
  read().listingPublicationData.bedrooms = 4
  const result = await run()
  expect(result.existing).toBe(true)
  expect(read().listingPublicationData.bedrooms).toBe(4)
  expect(api.updatePrivateListing).toHaveBeenCalledTimes(1)
  expect(api.syncPrivateListingDistributionData).toHaveBeenCalledTimes(1)
})

test('missing or cleared address cannot be replaced with a stale lead address', async () => {
  const { run, api } = fixture({ propertyAddress: '', propertyAddressLine1: '', propertyAddressDetails: { line1: '' } })
  await expect(run()).rejects.toThrow('Add the property address')
  expect(api.updatePrivateListing).not.toHaveBeenCalled()
  expect(api.syncPrivateListingDistributionData).not.toHaveBeenCalled()
  expect(hasSellerLeadDraftAddress({ lead: { sellerPropertyAddress: 'Old address' }, listing: { sellerOnboarding: { formData: { propertyAddress: '' } } } })).toBe(false)
})

test('failed marketing persistence leaves the intake unconverted and retry uses that same record', async () => {
  const { run, read, api } = fixture()
  api.syncPrivateListingDistributionData.mockRejectedValueOnce(new Error('temporarily unavailable'))
  await expect(run()).rejects.toThrow('temporarily unavailable')
  expect(read().listingSource).toBe('seller_lead_intake')
  await run()
  expect(read().listingSource).toBe('private_listing')
  expect(api.createPrivateListing).not.toHaveBeenCalled()
})

test('a concurrent seller save prevents promotion of an outdated snapshot', async () => {
  const { run, read, api } = fixture()
  api.syncPrivateListingDistributionData.mockImplementationOnce(async () => {
    read().sellerOnboarding.updatedAt = '2026-10-13T10:01:00Z'
    read().sellerOnboarding.formData.bedrooms = 4
    return {}
  })
  await expect(run()).rejects.toThrow('seller details changed')
  expect(api.updatePrivateListing).not.toHaveBeenCalled()
  expect(read().sellerOnboarding.formData.bedrooms).toBe(4)
})

test('prefill uses the authoritative full capture and preserves explicit blanks and stable people', () => {
  const saved = { sellerFirstName: 'Sam', email: '', bedrooms: '', bathrooms: 0, multipleOwners: [{ id: 'person-1', name: 'Sam' }], propertyAddress: '1 Example Road' }
  const prefill = buildSellerLeadListingPrefill({ lead: { sellerOnboarding: { formData: { email: 'stale@example.test', bedrooms: 7 } } },
    contact: { email: 'stale@example.test' }, listing: { bedrooms: 9, sellerOnboarding: { formData: saved } } })
  expect(prefill.sellerOnboardingFormData).toEqual(saved)
  expect(prefill.publicationData.bedrooms).toBeNull()
  expect(prefill.publicationData.bathrooms).toBe(0)
  expect(prefill.form.sellerEmail).toBeUndefined()
})

test('a lead without an intake creates one linked draft and persists its full capture exactly once', async () => {
  const profile = { propertyAddress: '1 Example Road', bedrooms: 3, bathrooms: 2, email: '',
    companyDirectors: [{ id: 'person-1', name: 'Sam', surname: 'Ngwenya' }], companyName: 'Example Company' }
  let saved
  const api = {
    createPrivateListing: vi.fn(async payload => {
      saved = { ...payload, id: 'new-listing', organisationId: 'org-1' }
      return { listing: saved }
    }),
    persistSellerProfileOnboardingFormData: vi.fn(async payload => ({ id: 'new-onboarding', token: 'new-token', form_data: structuredClone(payload.formData) })),
    getPrivateListing: vi.fn(async () => structuredClone(saved)),
    updatePrivateListing: vi.fn(async (id, patch) => { saved = { ...saved, ...patch } }),
    syncPrivateListingDistributionData: vi.fn(async (id, payload) => {
      // The production onboarding writer persists this row; the fixture stores
      // its confirmed receipt beside the private listing.
      saved.sellerOnboarding = { token: 'new-token', formData: structuredClone(profile) }
      saved.listingPublicationData = payload.publicationData
      return { listing: saved }
    }),
    updateAgencyCrmLeadRecord: vi.fn(async () => ({})),
  }
  const result = await createSellerLeadDraftListing({ organisationId: 'org-1', currentAgent: { id: 'agent-1' },
    lead: { leadId: 'lead-1', sellerOnboarding: { formData: profile } } }, api)
  expect(result.listing.sellerOnboarding.formData).toEqual(profile)
  expect(api.createPrivateListing).toHaveBeenCalledTimes(1)
  expect(api.persistSellerProfileOnboardingFormData.mock.calls[0][0].formData).toEqual(profile)
  expect(result.listing.listingPublicationData).toMatchObject({ bedrooms: 3, bathrooms: 2 })
  expect(api.updateAgencyCrmLeadRecord.mock.calls[0]).toEqual(['org-1', 'lead-1', { listingId: 'new-listing' }])
})

test('another agency’s linked listing cannot be promoted', async () => {
  const { run, read, api } = fixture()
  read().organisationId = 'another-org'
  await expect(run()).rejects.toThrow('does not belong')
  expect(api.updatePrivateListing).not.toHaveBeenCalled()
  expect(api.syncPrivateListingDistributionData).not.toHaveBeenCalled()
})

test('captured empty feature and amenity lists request explicit clearing of old draft marketing values', async () => {
  const { run, api } = fixture({ propertyAddress: '1 Example Road', features: [], amenities: [] })
  await run()
  expect(api.syncPrivateListingDistributionData.mock.calls[0][1]).toMatchObject({ publicationData: { features: [], amenities: [] }, allowBlankFeatures: true, allowBlankAmenities: true })
})

test('the current property address beats old formatted and street aliases', () => {
  const prefill = buildSellerLeadListingPrefill({ lead: { sellerPropertyAddress: 'Old lead address' }, listing: {
    sellerOnboarding: { formData: { propertyAddress: '22 Current Road, Cape Town', propertyAddressLine1: '22 Current Road',
      formattedAddress: 'Old formatted address', streetAddress: 'Old street address', city: 'Cape Town' } },
  } })
  expect(prefill.listingPayload.formattedAddress).toBe('22 Current Road, Cape Town')
  expect(prefill.listingPayload.addressLine1).toBe('22 Current Road')
  expect(hasSellerLeadDraftAddress({ listing: { sellerOnboarding: { formData: { propertyAddress: '', propertyAddressLine1: '', formattedAddress: 'Old address' } } } })).toBe(false)
})

test('another agent moving the intake into Listings prevents an outdated promotion', async () => {
  const { run, read, api } = fixture()
  api.syncPrivateListingDistributionData.mockImplementationOnce(async () => {
    read().listingSource = 'private_listing'; read().listingStatus = 'active'; read().isActive = true
    return {}
  })
  await expect(run()).rejects.toThrow('already moved into Listings')
  expect(api.updatePrivateListing).not.toHaveBeenCalled()
  expect(read().isActive).toBe(true)
})
