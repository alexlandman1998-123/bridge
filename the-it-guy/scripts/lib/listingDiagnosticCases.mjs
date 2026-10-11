import { createProperty24ListingPlan } from '../../server/services/property24ListingMapper.js'
import { createPrivatePropertyListingPlan } from '../../server/services/privatePropertyListingMapper.js'
import { createProperty24RentalListingPlan } from '../../server/services/property24RentalListingAdapter.js'
import { createPrivatePropertyRentalListingPlan } from '../../server/services/privatePropertyRentalListingAdapter.js'
import { buildRentalPrivateListingPayload, buildRentalPublicationDraft, RENTAL_LISTING_INITIAL_FORM } from '../../src/services/rentals/rentalListingDraftModel.js'

export const categories = [
  ['residential', 'Residential', 'House', 'Apartment'],
  ['commercial', 'Commercial', 'Office Building', 'Office'],
  ['industrial', 'Industrial', 'Warehouse', 'Warehouse'],
  ['retail', 'Retail', 'Retail Store', 'Shop'],
  ['agricultural', 'Agricultural', 'Farm', 'Farm'],
  ['mixed_use', 'Mixed Use', 'Mixed Use Building', 'Mixed-use'],
  ['vacant_land', 'Vacant Land', 'Vacant Land', 'Residential Land'],
]

// Synthetic account/catalog IDs. These never establish real portal entitlements.
export function listingCase(category, mode, overrides = {}) {
  const entry = categories.find(row => row[0] === category)
  if (!entry || !['sale', 'rental'].includes(mode)) throw new Error('Unknown diagnostic combination')
  const expiry = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)
  const media = [1, 2, 3].map(i => ({ id: String(i), media_type: 'image', file_url: `https://example.test/${i}.jpg`, bytes: 'AA==' }))
  const form = {
    ...RENTAL_LISTING_INITIAL_FORM,
    propertyCategory: category, propertyType: entry[mode === 'sale' ? 2 : 3],
    propertyAddress: '10 Diagnostic Road, Sandton', streetNumber: '10', streetName: 'Diagnostic Road',
    suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng', postalCode: '2196',
    listingPrice: '1250000', monthlyRent: '12500', bedrooms: '3', bathrooms: '2.5',
    floorSize: '98.5', erfSize: '500.5', depositPolicy: 'no_deposit', availableFrom: expiry,
    title: 'Diagnostic property', description: 'Spacious property with generous space.',
    listingDescription: 'Spacious property with generous space.', galleryImages: media, listingImages: media,
    selectedSyndicationChannels: ['property24', 'private_property'],
    mandateEndDate: expiry, property24ExpiryDate: expiry, ...overrides,
  }
  const listing = mode === 'rental'
    ? { ...buildRentalPrivateListingPayload(form, { organisationId: '22222222-2222-4222-8222-222222222222' }), listingType: 'Rental', listingStatus: 'active', id: `diagnostic-${category}`, property24SuburbId: '12345', privatePropertySuburbId: '12345' }
    : { id: `diagnostic-${category}`, listing_type: 'Sale', listing_status: 'active', property_category: category, property_type: form.propertyType, address_line_1: '10 Diagnostic Road', street_number: '10', street_name: 'Diagnostic Road', suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng', asking_price: Number(form.listingPrice), priceOnApplication: form.priceOnApplication, isPOA: form.priceOnApplication }
  const publication = mode === 'rental' ? buildRentalPublicationDraft(form) : {
    title: form.title, listing_type: 'Sale', property_category: category, property_type: form.propertyType,
    asking_price: Number(form.listingPrice), description: form.description, bedrooms: 3, bathrooms: 2.5,
    floor_size: 98.5, erf_size: 500.5, priceOnApplication: form.priceOnApplication,
    isPOA: form.priceOnApplication, pricePresentation: form.priceOnApplication ? 'Poa' : 'Standard',
  }
  return { category, mode, form, listing, publication, media, expiry }
}

export function portalPlans(fixture) {
  const { mode, listing, publication, media, expiry } = fixture
  return {
    property24: (mode === 'rental' ? createProperty24RentalListingPlan : createProperty24ListingPlan)({
      listing, publication, media, agentMapping: { property24AgentId: 77959, sourceReference: 'fixture-agent' },
      catalogMapping: { suburbId: 12345 },
      options: { agencyId: 31382, expiryDate: expiry, requirePhotoBytes: false, includeSubmitPayload: true },
    }),
    private_property: (mode === 'rental' ? createPrivatePropertyRentalListingPlan : createPrivatePropertyListingPlan)({
      listing, publication, media, agentMapping: { privatePropertyAgentId: 'FIXTURE' },
      options: { branchGuid: '11111111-1111-4111-8111-111111111111', suburbId: '12345' },
    }),
  }
}
