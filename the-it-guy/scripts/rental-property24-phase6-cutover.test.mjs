import assert from 'node:assert/strict'
import { buildRentalProperty24Phase6CutoverGate } from '../src/services/rentals/rentalProperty24Phase6CutoverModel.js'

assert.equal(buildRentalProperty24Phase6CutoverGate().status, 'PRODUCTION_CUTOVER_BLOCKED')
const gate = buildRentalProperty24Phase6CutoverGate({
  production: { credentialsReady: true, environment: 'production', agencyAllowlist: ['agency-1'], rentalLivePublishEnabled: true },
  pilot: { status: 'SUBMITTED', listingNumber: '2002001', portalVisible: true, reconciliationStatus: 'OK', leadRoutingVerified: true, failureMonitoringVerified: true },
})
assert.equal(gate.status, 'PILOT_COMPLETE_EXPANSION_REQUIRES_APPROVAL')
assert.equal(gate.safety.bulkPublishAllowed, false)
console.log('rental Property24 Phase 6 cutover tests passed')
