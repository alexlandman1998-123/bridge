import assert from 'node:assert/strict'

import {
  RENTAL_PROPERTY24_READINESS_VERSION,
  buildRentalProperty24PayloadPreview,
  buildRentalProperty24Readiness,
} from '../the-it-guy/src/services/rentals/rentalListingProperty24ReadinessModel.js'

const completeListing = {
  id: 'rental-portal-ready-1',
  title: 'Green Point rental apartment',
  formattedAddress: '12 Main Road',
  suburb: 'Green Point',
  city: 'Cape Town',
  province: 'Western Cape',
  propertyType: 'Apartment',
  property24AgencyId: 'p24-agency-1',
  property24ContactAgentIds: ['p24-agent-1'],
  property24SuburbId: 'p24-suburb-123',
  property24PropertyTypeId: 'p24-type-apartment',
  assignedAgentId: 'agent-1',
  mandateEndDate: '2026-12-31',
  bedrooms: 2,
  bathrooms: 2,
  parkingBays: 1,
  garages: 1,
  garden: false,
  pool: true,
  flatlet: false,
  description: 'Bright apartment close to restaurants and the promenade.',
  photos: ['https://example.test/photo-1.jpg', 'https://example.test/photo-2.jpg'],
  sellerCanonicalFacts: {
    landlordName: 'A Landlord',
    landlordEmail: 'landlord@example.com',
    rentalInfo: {
      monthlyRent: 24500,
      depositAmount: 49000,
      availableFrom: '2026-09-01',
      leasePeriodMonths: 12,
      furnishedStatus: 'semi_furnished',
      petsPolicy: 'not_allowed',
      utilitiesPolicy: 'tenant_pays',
      mandateStatus: 'signed_uploaded',
      marketingApprovalStatus: 'approved',
    },
  },
}

const readiness = buildRentalProperty24Readiness(completeListing)
assert.equal(readiness.version, RENTAL_PROPERTY24_READINESS_VERSION)
assert.equal(readiness.totalCount, 20)
assert.equal(readiness.completedCount, 20)
assert.equal(readiness.readinessPercent, 100)
assert.equal(readiness.readyToPublish, true)
assert.deepEqual(readiness.blockers, [])
assert.deepEqual(readiness.missingContractFields, [])
assert.equal(readiness.payloadPreview.listingType, 'Rental')
assert.equal(readiness.payloadPreview.expiryDate, '2026-12-31')
assert.equal(readiness.payloadPreview.rentalInfo.monthlyRent, 24500)
assert.equal(readiness.payloadPreview.rentalInfo.petsAllowed, false)
assert.equal(readiness.payloadPreview.rentalInfo.occupationDate, '2026-09-01')
assert.equal(readiness.payloadPreview.rentalInfo.depositAmount, 49000)
assert.equal(readiness.payloadPreview.property.garages, 1)
assert.equal(readiness.payloadPreview.property.pool, true)
assert.equal(readiness.payloadPreview.marketing.photos.length, 2)

const payloadPreview = buildRentalProperty24PayloadPreview(completeListing)
assert.equal(payloadPreview.agencyId, 'p24-agency-1')
assert.deepEqual(payloadPreview.contactAgentIds, ['p24-agent-1'])
assert.equal(payloadPreview.agentSourceReference, 'rental-portal-ready-1')
assert.equal(payloadPreview.property.suburbId, 'p24-suburb-123')
assert.equal(payloadPreview.property.propertyTypeId, 'p24-type-apartment')

const draftListing = {
  id: 'rental-draft-1',
  title: 'Unmapped rental',
  formattedAddress: '1 Draft Street',
  suburb: 'Sea Point',
  city: 'Cape Town',
  propertyType: 'Apartment',
  askingPrice: 18000,
  sellerCanonicalFacts: {
    rentalInfo: {
      monthlyRent: 18000,
      availableFrom: '2026-10-01',
      marketingApprovalStatus: 'draft',
      mandateStatus: 'not_started',
    },
  },
}

const draftReadiness = buildRentalProperty24Readiness(draftListing)
const blockerKeys = draftReadiness.blockers.map((blocker) => blocker.key)
for (const expectedBlocker of [
  'agencyId',
  'contactAgentIds',
  'suburbId',
  'propertyTypeId',
  'expiryDate',
  'description',
  'photos',
  'petsAllowed',
  'furnishedStatus',
  'garages',
  'garden',
  'pool',
  'flatlet',
  'marketingApprovalStatus',
  'mandateStatus',
]) {
  assert.ok(blockerKeys.includes(expectedBlocker), `missing blocker: ${expectedBlocker}`)
}
assert.equal(draftReadiness.readyToPublish, false)
assert.equal(draftReadiness.payloadPreview.listingType, 'Rental')
assert.equal(draftReadiness.payloadPreview.rentalInfo.monthlyRent, 18000)

console.log('rental Property24 readiness tests passed')
