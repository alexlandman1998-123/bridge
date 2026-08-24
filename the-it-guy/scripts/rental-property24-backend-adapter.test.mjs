import assert from 'node:assert/strict'
import {
  createProperty24RentalListingPlan,
  PROPERTY24_RENTAL_LISTING_ADAPTER_VERSION,
} from '../server/services/property24RentalListingAdapter.js'
import {
  RENTAL_LISTING_RELEASE_GATE_FIXTURE,
} from '../src/services/rentals/rentalListingReleaseGateModel.js'
import {
  RENTAL_PROPERTY24_FIELD_STATUS,
} from '../src/services/rentals/rentalListingProperty24FieldComparisonModel.js'

const previewOnly = createProperty24RentalListingPlan({
  listing: RENTAL_LISTING_RELEASE_GATE_FIXTURE,
})

assert.equal(previewOnly.version, PROPERTY24_RENTAL_LISTING_ADAPTER_VERSION)
assert.equal(previewOnly.phase, 'property24-rental-listing-backend-preview')
assert.equal(previewOnly.safety.property24ApiCalled, false)
assert.equal(previewOnly.safety.databaseWritten, false)
assert.equal(previewOnly.safety.listingPublished, false)
assert.equal(previewOnly.canPreview, true)
assert.equal(previewOnly.canSubmit, false)
assert.deepEqual(previewOnly.dataBlockers, [])
assert.deepEqual(previewOnly.technicalBlockers, ['listing_image_bytes_not_loaded_for_property24_submit'])
assert.equal(previewOnly.summary.listingType, 'Rental')
assert.equal(previewOnly.summary.agencyId, 31382)
assert.deepEqual(previewOnly.summary.contactAgentIds, [77959])
assert.equal(previewOnly.summary.monthlyRent, 22000)
assert.equal(previewOnly.summary.occupationDate, '2026-09-01T00:00:00.000Z')
assert.equal(previewOnly.summary.rentalRate, 'Month')
assert.equal(previewOnly.summary.backendAdapterPreviewOnly, true)
assert.equal(previewOnly.previewPayload.listingType, 'Rental')
assert.equal(previewOnly.previewPayload.price, 22000)
assert.equal(previewOnly.previewPayload.occupationDate, '2026-09-01T00:00:00.000Z')
assert.deepEqual(previewOnly.previewPayload.rentalInfo, {
  rentalRate: 'Month',
  depositRequirementsComments: 'Equal to deposit amount R44000',
  leasePeriod: '12 Months',
})
assert.equal(previewOnly.previewPayload.propertyFeatures.petsAllowed, 'No')
assert.equal(previewOnly.previewPayload.propertyFeatures.furnishedStatus, 'No')
assert.equal(previewOnly.previewPayload.photos[0].sourceUrl, 'https://example.test/release-gate-rental.jpg')
assert.equal(previewOnly.previewPayload.photos[0].bytesLoaded, false)
assert.equal(Object.hasOwn(previewOnly, 'payload'), false)

const submitReady = createProperty24RentalListingPlan({
  listing: RENTAL_LISTING_RELEASE_GATE_FIXTURE,
  media: [{
    mediaType: 'image',
    bytes: 'base64-rental-image',
    mimeContentType: 'image/jpeg',
    caption: 'Front view',
  }],
  options: {
    includeSubmitPayload: true,
  },
})

assert.equal(submitReady.canPreview, true)
assert.equal(submitReady.canSubmit, true)
assert.equal(submitReady.status, 'SUBMIT_READY')
assert.equal(submitReady.payload.listingType, 'Rental')
assert.equal(submitReady.payload.price, 22000)
assert.equal(submitReady.payload.occupationDate, '2026-09-01T00:00:00.000Z')
assert.equal(submitReady.payload.rentalInfo.rentalRate, 'Month')
assert.equal(submitReady.payload.rentalInfo.depositRequirementsComments, 'Equal to deposit amount R44000')
assert.equal(submitReady.payload.rentalInfo.leasePeriod, '12 Months')
assert.equal(submitReady.payload.photos[0].bytes, 'base64-rental-image')

const fakeAgentIdPreview = createProperty24RentalListingPlan({
  listing: {
    ...RENTAL_LISTING_RELEASE_GATE_FIXTURE,
    property24ContactAgentIds: ['p24-agent-1'],
  },
})
const fakeAgentRows = Object.fromEntries(fakeAgentIdPreview.fieldComparison.rows.map((row) => [row.key, row]))

assert.equal(fakeAgentIdPreview.canPreview, true)
assert.equal(fakeAgentIdPreview.canSubmit, false)
assert.deepEqual(fakeAgentIdPreview.previewPayload.contactAgentIds, [])
assert.ok(fakeAgentIdPreview.technicalBlockers.includes('sandbox_property24_agent_id_required_before_submit'))
assert.equal(fakeAgentRows.contactAgentIds.status, RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_MAPPING)
assert.equal(
  JSON.stringify(fakeAgentIdPreview.previewPayload).includes('p24-agent-1'),
  false,
  'Fake Property24 agent ID must never be copied into the payload',
)

const missingAvailability = createProperty24RentalListingPlan({
  listing: {
    ...RENTAL_LISTING_RELEASE_GATE_FIXTURE,
    sellerCanonicalFacts: {
      ...RENTAL_LISTING_RELEASE_GATE_FIXTURE.sellerCanonicalFacts,
      rentalInfo: {
        ...RENTAL_LISTING_RELEASE_GATE_FIXTURE.sellerCanonicalFacts.rentalInfo,
        availableFrom: '',
      },
    },
  },
})

assert.equal(missingAvailability.canPreview, false)
assert.equal(missingAvailability.status, 'BLOCKED')
assert.ok(missingAvailability.dataBlockers.includes('missing_rental_occupation_date'))
assert.equal(missingAvailability.previewPayload, null)

console.log('Rental Property24 backend adapter contract passed')
