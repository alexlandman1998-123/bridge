import assert from 'node:assert/strict'

import {
  RENTAL_PROPERTY24_PUBLISH_REQUEST_VERSION,
  buildRentalProperty24PublishRequest,
} from '../the-it-guy/src/services/rentals/rentalListingProperty24PublishModel.js'

const readyListing = {
  id: 'rental-ready-1',
  title: 'Ready rental',
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
  bedrooms: 2,
  bathrooms: 2,
  parkingBays: 1,
  garden: false,
  pool: false,
  flatlet: false,
  description: 'A bright rental apartment ready for portal publication.',
  photos: ['https://example.test/rental.jpg'],
  sellerCanonicalFacts: {
    rentalInfo: {
      monthlyRent: 22000,
      depositAmount: 44000,
      availableFrom: '2026-09-01',
      leasePeriodMonths: 12,
      furnishedStatus: 'unfurnished',
      petsPolicy: 'not_allowed',
      utilitiesPolicy: 'tenant_pays',
      mandateStatus: 'signed_uploaded',
      marketingApprovalStatus: 'approved',
    },
  },
}

const request = buildRentalProperty24PublishRequest(readyListing, {
  requestedAt: '2026-08-24T12:00:00.000Z',
  requestedBy: 'agent-1',
})

assert.equal(request.version, RENTAL_PROPERTY24_PUBLISH_REQUEST_VERSION)
assert.equal(request.status, 'ready_for_backend_publish')
assert.equal(request.canPrepare, true)
assert.equal(request.liveWriteEnabled, false)
assert.equal(request.requiresBackendPublisher, true)
assert.equal(request.listingId, 'rental-ready-1')
assert.equal(request.requestedAt, '2026-08-24T12:00:00.000Z')
assert.equal(request.requestedBy, 'agent-1')
assert.equal(request.requestPayload.listingType, 'Rental')
assert.equal(request.requestPayload.rentalInfo.monthlyRent, 22000)
assert.equal(request.activity.activityType, 'property24_rental_publish_request_prepared')
assert.match(request.idempotencyKey, /^property24-rental-publish:rental-ready-1:/)
assert.deepEqual(request.blockers, [])

const blockedRequest = buildRentalProperty24PublishRequest({
  id: 'rental-blocked-1',
  title: 'Blocked rental',
  askingPrice: 12000,
  sellerCanonicalFacts: {
    rentalInfo: {
      monthlyRent: 12000,
      availableFrom: '2026-10-01',
      marketingApprovalStatus: 'draft',
      mandateStatus: 'not_started',
    },
  },
})

assert.equal(blockedRequest.status, 'blocked')
assert.equal(blockedRequest.canPrepare, false)
assert.equal(blockedRequest.liveWriteEnabled, false)
assert.equal(blockedRequest.requestPayload, null)
assert.equal(blockedRequest.activity.activityType, 'property24_rental_publish_blocked')
assert.ok(blockedRequest.blockers.some((blocker) => blocker.key === 'agencyId'))
assert.ok(blockedRequest.blockers.some((blocker) => blocker.key === 'mandateStatus'))

console.log('rental Property24 publish request tests passed')
