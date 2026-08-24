import assert from 'node:assert/strict'

import {
  buildRentalListingIndexRow,
  buildRentalListingIndexRows,
  filterRentalListingIndexRows,
  formatRentalIndexStatusLabel,
  RENTAL_LISTING_INDEX_VERSION,
  RENTAL_LISTING_STATUS_TABS,
  summarizeRentalListingIndexRows,
} from '../the-it-guy/src/services/rentals/rentalListingIndexModel.js'

assert.equal(RENTAL_LISTING_INDEX_VERSION, 'arch9_rental_listing_index_v1')
assert.deepEqual(RENTAL_LISTING_STATUS_TABS.map((tab) => tab.key), [
  'all',
  'draft',
  'mandate',
  'ready',
  'published',
  'applications',
])

const draftListing = {
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
    propertyAddress: '10 Beach Road',
    rentalInfo: {
      monthlyRent: 18500,
      depositAmount: 37000,
      availableFrom: '2026-09-01',
      leasePeriodMonths: 12,
      mandateStatus: 'not_started',
      marketingApprovalStatus: 'draft',
      furnishedStatus: 'unfurnished',
      petsPolicy: 'subject_to_approval',
      utilitiesPolicy: 'tenant_pays',
    },
  },
}

const readyListing = {
  id: 'rental-2',
  listingTitle: 'Green Point townhouse',
  addressLine1: '5 Main Road',
  listingPublicationData: JSON.stringify({
    title: 'Green Point townhouse',
    status: 'Ready',
    propertyType: 'Townhouse',
    askingPrice: 32000,
  }),
  sellerCanonicalFacts: JSON.stringify({
    landlordName: 'Trust Owner',
    landlordPhone: '+27110000000',
    rentalInfo: {
      availableFrom: '2026-10-01',
      mandateStatus: 'signed_uploaded',
      marketingApprovalStatus: 'approved',
    },
  }),
}

const publishedListing = {
  id: 'rental-3',
  title: 'Furnished city studio',
  property24Status: 'published',
  applicationCount: 3,
  sellerCanonicalFacts: {
    landlordName: 'Company Owner',
    rentalInfo: {
      monthlyRent: 14500,
      availableFrom: '2026-09-15',
      mandateStatus: 'signed',
      marketingApprovalStatus: 'approved',
    },
  },
}

const draftRow = buildRentalListingIndexRow(draftListing)
assert.equal(draftRow.title, 'Sea Point apartment')
assert.equal(draftRow.monthlyRent, 18500)
assert.equal(draftRow.landlordName, 'A Landlord')
assert.equal(draftRow.statusGroup, 'mandate')
assert.equal(draftRow.nextAction, 'Complete rental mandate')

const readyRow = buildRentalListingIndexRow(readyListing)
assert.equal(readyRow.monthlyRent, 32000)
assert.equal(readyRow.mandateStatus, 'signed_uploaded')
assert.equal(readyRow.statusGroup, 'ready')
assert.equal(readyRow.nextAction, 'Review Property24 publishing')

const publishedRow = buildRentalListingIndexRow(publishedListing)
assert.equal(publishedRow.statusGroup, 'published')
assert.equal(publishedRow.applicationCount, 3)
assert.equal(publishedRow.nextAction, 'Review tenant applications')

const rows = buildRentalListingIndexRows([draftListing, readyListing, publishedListing])
const summary = summarizeRentalListingIndexRows(rows)
assert.equal(summary.total, 3)
assert.equal(summary.mandate, 1)
assert.equal(summary.ready, 1)
assert.equal(summary.published, 1)
assert.equal(summary.applications, 1)

assert.deepEqual(filterRentalListingIndexRows(rows, { status: 'ready' }).map((row) => row.id), ['rental-2'])
assert.deepEqual(filterRentalListingIndexRows(rows, { status: 'applications' }).map((row) => row.id), ['rental-3'])
assert.deepEqual(filterRentalListingIndexRows(rows, { query: 'trust owner' }).map((row) => row.id), ['rental-2'])
assert.equal(formatRentalIndexStatusLabel('signed_uploaded'), 'Signed Uploaded')

console.log('rental listing index model tests passed')
