import assert from 'node:assert/strict'

import {
  getRentalListingArchitecture,
  getRentalListingFieldNames,
  getRentalListingRouteMap,
  PROPERTY24_RENTAL_READINESS_FIELDS,
  RENTAL_LISTING_DEFERRED_CAPABILITIES,
  RENTAL_LISTING_DETAIL_TABS,
  RENTAL_LISTING_INDEX_COLUMNS,
  RENTAL_LISTING_ROUTES,
  RENTAL_LISTING_STORAGE_DECISION,
  SHARED_RESIDENTIAL_LISTING_SURFACES,
} from '../the-it-guy/src/services/rentals/rentalListingArchitecture.js'
import {
  RENTAL_LISTING_INITIAL_FORM,
  buildRentalCanonicalFacts,
  buildRentalPrivateListingPayload,
} from '../the-it-guy/src/services/rentals/rentalListingDraftModel.js'

const architecture = getRentalListingArchitecture()

assert.equal(architecture.version, 'arch9_rental_listing_architecture_v1')
assert.equal(RENTAL_LISTING_STORAGE_DECISION.currentSourceOfRecord, 'private_listings')
assert.equal(RENTAL_LISTING_STORAGE_DECISION.nextStructuredExtension, 'rental_listing_details')
assert.equal(RENTAL_LISTING_STORAGE_DECISION.accountingBoundary, 'excluded_until_rent_collection_phase')

const sharedSurfaceKeys = SHARED_RESIDENTIAL_LISTING_SURFACES.map((surface) => surface.key)
assert.deepEqual(sharedSurfaceKeys, [
  'index',
  'create_flow',
  'detail',
  'media',
  'mandate',
  'marketing',
  'syndication',
  'activity',
])
assert.ok(SHARED_RESIDENTIAL_LISTING_SURFACES.every((surface) => surface.salesSurface && surface.rentalSurface))

assert.equal(RENTAL_LISTING_ROUTES.index, '/agent/rentals/listings')
assert.equal(RENTAL_LISTING_ROUTES.create, '/agent/rentals/listings/new')
assert.equal(RENTAL_LISTING_ROUTES.legacyCreateQuery, '/agent/rentals/listings?create=rental')
assert.equal(RENTAL_LISTING_ROUTES.detail, '/agent/rentals/listings/:listingId')
assert.equal(getRentalListingRouteMap().syndication, '/agent/rentals/listings/:listingId/syndication')

const tabKeys = RENTAL_LISTING_DETAIL_TABS.map((tab) => tab.key)
assert.deepEqual(tabKeys, [
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
assert.ok(RENTAL_LISTING_DETAIL_TABS.every((tab) => tab.salesParity && RENTAL_LISTING_ROUTES[tab.routeKey]))

for (const column of ['monthlyRent', 'availableFrom', 'landlord', 'mandateStatus', 'property24Status', 'applicationCount']) {
  assert.ok(RENTAL_LISTING_INDEX_COLUMNS.includes(column), `missing rental index column: ${column}`)
}

const fieldNames = getRentalListingFieldNames()
for (const field of Object.keys(RENTAL_LISTING_INITIAL_FORM)) {
  assert.ok(fieldNames.includes(field), `initial form field missing from architecture contract: ${field}`)
}
for (const field of ['landlordClientId', 'property24PayloadPreview', 'applicationCount']) {
  assert.ok(fieldNames.includes(field), `future extension field missing from architecture contract: ${field}`)
}

for (const readinessField of [
  'listingType',
  'rentalInfo',
  'agencyId',
  'contactAgentIds',
  'suburbId',
  'propertyTypeId',
  'monthlyRent',
  'availableFrom',
  'photos',
  'marketingApprovalStatus',
  'mandateStatus',
]) {
  assert.ok(PROPERTY24_RENTAL_READINESS_FIELDS.includes(readinessField), `missing Property24 readiness field: ${readinessField}`)
}

for (const delayed of ['rent_collection', 'arrears', 'landlord_payouts', 'full_rental_accounting']) {
  assert.ok(RENTAL_LISTING_DEFERRED_CAPABILITIES.includes(delayed), `missing deferred capability: ${delayed}`)
}

const sampleForm = {
  ...RENTAL_LISTING_INITIAL_FORM,
  landlordName: 'A Landlord',
  landlordEmail: 'landlord@example.com',
  propertyAddress: '10 Beach Road',
  suburb: 'Sea Point',
  city: 'Cape Town',
  province: 'Western Cape',
  monthlyRent: '18500',
  depositAmount: '37000',
  availableFrom: '2026-09-01',
  description: 'Bright rental apartment.',
}

const facts = buildRentalCanonicalFacts(sampleForm)
assert.equal(facts.listingType, 'Rental')
assert.equal(facts.rentalInfo.monthlyRent, 18500)
assert.equal(facts.rentalInfo.availableFrom, '2026-09-01')

const payload = buildRentalPrivateListingPayload(sampleForm, {
  organisationId: 'org-1',
  branchId: 'branch-1',
  assignedAgentId: 'agent-1',
})
assert.equal(payload.listingCategory, 'rental')
assert.equal(payload.sellerCanonicalFacts.listingType, 'Rental')
assert.equal(payload.sellerCanonicalFacts.rentalInfo.monthlyRent, 18500)

console.log('rental listing architecture tests passed')
