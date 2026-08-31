import assert from 'node:assert/strict'
import { buildRentalProperty24Phase5Acceptance } from '../src/services/rentals/rentalProperty24Phase5AcceptanceModel.js'

const blocked = buildRentalProperty24Phase5Acceptance()
assert.equal(blocked.status, 'EVIDENCE_REQUIRED')
assert.equal(blocked.checks.filter((item) => item.passed).length, 0)
const accepted = buildRentalProperty24Phase5Acceptance({
  publish: { status: 'SUBMITTED', listingNumber: '1001001' },
  rendered: { monthlyRent: true, occupationDate: true, contactAgent: true, photos: true },
  negative: { missingPhoto: true, invalidAgent: true, duplicateSubmit: true },
  reconciliation: { status: 'OK', matchedCount: 1 },
})
assert.equal(accepted.status, 'ACCEPTED_FOR_PHASE6')
assert.equal(accepted.safety.productionAllowed, false)
console.log('rental Property24 Phase 5 acceptance tests passed')
