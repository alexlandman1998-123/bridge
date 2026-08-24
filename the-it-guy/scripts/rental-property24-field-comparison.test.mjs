import assert from 'node:assert/strict'
import {
  PROPERTY24_RENTAL_READINESS_FIELDS,
} from '../src/services/rentals/rentalListingArchitecture.js'
import {
  buildRentalProperty24FieldComparison,
  RENTAL_PROPERTY24_FIELD_COMPARISON_VERSION,
  RENTAL_PROPERTY24_FIELD_STATUS,
} from '../src/services/rentals/rentalListingProperty24FieldComparisonModel.js'
import {
  RENTAL_LISTING_RELEASE_GATE_FIXTURE,
  buildRentalListingReleaseGate,
} from '../src/services/rentals/rentalListingReleaseGateModel.js'

const readyComparison = buildRentalProperty24FieldComparison(RENTAL_LISTING_RELEASE_GATE_FIXTURE)

assert.equal(readyComparison.version, RENTAL_PROPERTY24_FIELD_COMPARISON_VERSION)
assert.equal(readyComparison.property24Service, 'Listing Service v53')
assert.equal(readyComparison.listingType, 'Rental')
assert.equal(readyComparison.readyForBackendAdapter, true)
assert.equal(readyComparison.summary.blockers, 0)
assert.equal(readyComparison.missingReadinessFields.length, 0)
assert.equal(readyComparison.missingComparisonFields.length, 0)

for (const readinessField of PROPERTY24_RENTAL_READINESS_FIELDS) {
  assert.ok(
    readyComparison.rows.some((row) => row.key === readinessField),
    `Expected comparison row for readiness field ${readinessField}`,
  )
}

const readyRows = Object.fromEntries(readyComparison.rows.map((row) => [row.key, row]))

assert.equal(readyRows.listingType.property24Field, 'listingType')
assert.equal(readyRows.listingType.property24Value, 'Rental')
assert.equal(readyRows.agencyId.property24Field, 'agencyId')
assert.equal(readyRows.agencyId.status, RENTAL_PROPERTY24_FIELD_STATUS.MAPPED)
assert.equal(readyRows.contactAgentIds.property24Field, 'contactAgentIds')
assert.equal(readyRows.contactAgentIds.status, RENTAL_PROPERTY24_FIELD_STATUS.MAPPED)
assert.equal(readyRows.monthlyRent.property24Field, 'price')
assert.equal(readyRows.monthlyRent.property24Value, 22000)
assert.equal(readyRows.rentalRate.property24Field, 'rentalInfo.rentalRate')
assert.equal(readyRows.rentalRate.property24Value, 'Month')
assert.equal(readyRows.availableFrom.property24Field, 'occupationDate')
assert.equal(readyRows.availableFrom.property24Value, '2026-09-01T00:00:00.000Z')
assert.equal(readyRows.expiryDate.property24Field, 'expiryDate')
assert.equal(readyRows.expiryDate.property24Value, '2026-12-31T00:00:00.000Z')
assert.equal(readyRows.petsAllowed.property24Field, 'propertyFeatures.petsAllowed')
assert.equal(readyRows.petsAllowed.property24Value, 'No')
assert.equal(readyRows.furnishedStatus.property24Field, 'propertyFeatures.furnishedStatus')
assert.equal(readyRows.furnishedStatus.property24Value, 'No')
assert.equal(readyRows.depositAmount.property24Field, 'rentalInfo.depositRequirementsComments')
assert.equal(readyRows.depositAmount.property24Value, 'Equal to deposit amount R44000')
assert.equal(readyRows.leasePeriodMonths.property24Field, 'rentalInfo.leasePeriod')
assert.equal(readyRows.leasePeriodMonths.property24Value, '12 Months')
assert.equal(readyRows.marketingApprovalStatus.property24Field, 'internal publish gate')
assert.equal(readyRows.marketingApprovalStatus.status, RENTAL_PROPERTY24_FIELD_STATUS.INTERNAL_GATE)
assert.equal(readyRows.mandateStatus.property24Field, 'internal publish gate')
assert.equal(readyRows.mandateStatus.status, RENTAL_PROPERTY24_FIELD_STATUS.INTERNAL_GATE)

const incompleteComparison = buildRentalProperty24FieldComparison({
  ...RENTAL_LISTING_RELEASE_GATE_FIXTURE,
  property24AgencyId: '',
  property24ContactAgentIds: [],
  property24SuburbId: '',
  property24PropertyTypeId: '',
  mandateEndDate: '',
  photos: [],
  sellerCanonicalFacts: {
    ...RENTAL_LISTING_RELEASE_GATE_FIXTURE.sellerCanonicalFacts,
    rentalInfo: {
      ...RENTAL_LISTING_RELEASE_GATE_FIXTURE.sellerCanonicalFacts.rentalInfo,
      monthlyRent: null,
      availableFrom: '',
      marketingApprovalStatus: 'draft',
      mandateStatus: 'sent',
    },
  },
})

const incompleteBlockerKeys = incompleteComparison.blockers.map((row) => row.key)
for (const blocker of [
  'agencyId',
  'contactAgentIds',
  'suburbId',
  'propertyTypeId',
  'monthlyRent',
  'availableFrom',
  'expiryDate',
  'photos',
  'marketingApprovalStatus',
  'mandateStatus',
]) {
  assert.ok(incompleteBlockerKeys.includes(blocker), `Expected blocker ${blocker}`)
}
assert.equal(incompleteComparison.readyForBackendAdapter, false)

const fakeIdComparison = buildRentalProperty24FieldComparison({
  ...RENTAL_LISTING_RELEASE_GATE_FIXTURE,
  property24AgencyId: 'p24-agency-1',
  property24ContactAgentIds: ['p24-agent-1'],
  property24SuburbId: 'p24-suburb-123',
  property24PropertyTypeId: 'p24-type-apartment',
})

const fakeIdRows = Object.fromEntries(fakeIdComparison.rows.map((row) => [row.key, row]))
assert.equal(fakeIdRows.agencyId.status, RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_MAPPING)
assert.equal(fakeIdRows.contactAgentIds.status, RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_MAPPING)
assert.equal(fakeIdRows.suburbId.status, RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_MAPPING)
assert.equal(fakeIdRows.propertyTypeId.status, RENTAL_PROPERTY24_FIELD_STATUS.NEEDS_MAPPING)
assert.equal(fakeIdComparison.readyForBackendAdapter, false)

const releaseGate = buildRentalListingReleaseGate()
assert.equal(releaseGate.passed, true)
assert.equal(releaseGate.property24FieldComparison.readyForBackendAdapter, true)
assert.ok(releaseGate.checks.some((check) => check.key === 'property24_field_comparison_contract' && check.passed))

console.log('Rental Property24 field comparison contract passed')
