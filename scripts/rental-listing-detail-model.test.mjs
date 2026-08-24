import assert from 'node:assert/strict'

import {
  buildRentalListingDetailPath,
  buildRentalListingDetailView,
  getRentalListingDetailTabs,
  RENTAL_LISTING_DETAIL_VERSION,
  resolveRentalListingDetailTab,
} from '../the-it-guy/src/services/rentals/rentalListingDetailModel.js'

const sampleListing = {
  id: 'rental-1',
  title: 'Sea Point apartment',
  formattedAddress: '10 Beach Road',
  suburb: 'Sea Point',
  city: 'Cape Town',
  propertyType: 'Apartment',
  askingPrice: 18500,
  property24Status: 'not_published',
  sellerCanonicalFacts: {
    landlordName: 'A Landlord',
    landlordEmail: 'landlord@example.com',
    rentalInfo: {
      monthlyRent: 18500,
      depositAmount: 37000,
      availableFrom: '2026-09-01',
      leasePeriodMonths: 12,
      mandateStatus: 'signed_uploaded',
      marketingApprovalStatus: 'approved',
      inspectionStatus: 'completed',
    },
  },
}

assert.equal(RENTAL_LISTING_DETAIL_VERSION, 'arch9_rental_listing_detail_v1')
assert.equal(resolveRentalListingDetailTab('terms'), 'terms')
assert.equal(resolveRentalListingDetailTab('bad-tab'), 'overview')
assert.equal(buildRentalListingDetailPath('rental-1', 'overview'), '/agent/rentals/listings/rental-1')
assert.equal(buildRentalListingDetailPath('rental-1', 'syndication'), '/agent/rentals/listings/rental-1/syndication')

const tabs = getRentalListingDetailTabs('rental-1')
assert.deepEqual(tabs.map((tab) => tab.key), [
  'overview',
  'property',
  'landlord',
  'terms',
  'mandate',
  'inspection',
  'marketing',
  'syndication',
  'applications',
  'activity',
])
assert.equal(tabs.find((tab) => tab.key === 'landlord').path, '/agent/rentals/listings/rental-1/landlord')

const detail = buildRentalListingDetailView(sampleListing)
assert.equal(detail.version, RENTAL_LISTING_DETAIL_VERSION)
assert.equal(detail.row.title, 'Sea Point apartment')
assert.equal(detail.row.monthlyRent, 18500)
assert.equal(detail.mandateStatusLabel, 'Signed Uploaded')
assert.equal(detail.marketingApprovalStatusLabel, 'Approved')
assert.equal(detail.property24Readiness.payloadPreview.listingType, 'Rental')
assert.ok(detail.property24Readiness.blockers.some((blocker) => blocker.key === 'agencyId'))
assert.ok(detail.property24Readiness.blockers.some((blocker) => blocker.key === 'suburbId'))
assert.equal(detail.completedReadinessCount, 4)
assert.equal(detail.totalReadinessCount, 5)
assert.equal(detail.readinessPercent, 80)

console.log('rental listing detail model tests passed')
