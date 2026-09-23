import assert from 'node:assert/strict'
import {
  buildRentalProperty24Phase5Acceptance,
  RENTAL_PROPERTY24_PHASE5_MAXIMUM_EXDEV_LISTINGS,
} from '../src/services/rentals/rentalProperty24Phase5AcceptanceModel.js'

const blocked = buildRentalProperty24Phase5Acceptance()
assert.equal(blocked.status, 'EVIDENCE_REQUIRED')
assert.equal(blocked.checks.filter((item) => item.passed).length, 0)
const accepted = buildRentalProperty24Phase5Acceptance({
  publish: { status: 'SUBMITTED', listingNumber: '1001001', environment: 'exdev' },
  safety: { exdevListingCount: 1, customerDataIncluded: false },
  rendered: { rentalAmount: true, rentalRate: true, depositPolicy: true, occupationDate: true, contactAgent: true, photos: true },
  negative: { missingPhoto: true, invalidAgent: true, duplicateSubmit: true, unsupportedHouseShare: true },
  reconciliation: { status: 'OK', matchedCount: 1 },
  optional: { retirementAccommodationNotMapped: true },
})
assert.equal(accepted.status, 'ACCEPTED_FOR_PHASE6')
assert.equal(accepted.safety.productionAllowed, false)
assert.equal(accepted.safety.portalCallsMade, false)
assert.equal(accepted.evidence.rendered.rentalRate, true)
assert.equal(accepted.optionalMappingNotes.length, 1)

const productionEvidence = buildRentalProperty24Phase5Acceptance({
  publish: { status: 'SUBMITTED', listingNumber: '1001001', environment: 'production' },
  safety: { exdevListingCount: 1 },
  rendered: { rentalAmount: true, rentalRate: true, depositPolicy: true, occupationDate: true, contactAgent: true, photos: true },
  negative: { missingPhoto: true, invalidAgent: true, duplicateSubmit: true, unsupportedHouseShare: true },
  reconciliation: { status: 'OK', matchedCount: 1 },
})
assert.equal(productionEvidence.status, 'EVIDENCE_REQUIRED')
assert.equal(productionEvidence.failedChecks[0].key, 'exdev_only')

const overLimitEvidence = buildRentalProperty24Phase5Acceptance({
  publish: { status: 'SUBMITTED', listingNumber: '1001001', environment: 'exdev' },
  safety: { exdevListingCount: RENTAL_PROPERTY24_PHASE5_MAXIMUM_EXDEV_LISTINGS + 1 },
  rendered: { rentalAmount: true, rentalRate: true, depositPolicy: true, occupationDate: true, contactAgent: true, photos: true },
  negative: { missingPhoto: true, invalidAgent: true, duplicateSubmit: true, unsupportedHouseShare: true },
  reconciliation: { status: 'OK', matchedCount: 1 },
})
assert.equal(overLimitEvidence.status, 'EVIDENCE_REQUIRED')
assert.ok(overLimitEvidence.failedChecks.some((item) => item.key === 'exdev_only'))
console.log('rental Property24 Phase 5 acceptance tests passed')
