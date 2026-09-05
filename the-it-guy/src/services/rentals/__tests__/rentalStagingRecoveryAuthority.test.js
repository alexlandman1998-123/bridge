import assert from 'node:assert/strict'
import { assessRentalStagingRecoveryAuthority } from '../rentalStagingRecoveryAuthority.js'

const valid = {
  stagingRecovery: { confirmed: true, reference: 'SUPABASE-SNAPSHOT-20260905', recordedAt: '2026-09-05T13:00:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', recoveryMode: 'snapshot', containsSecrets: false, containsCustomerRecords: false },
  stagingFreeze: { confirmed: true, reference: 'CHANGE-123', recordedAt: '2026-09-05T13:01:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', deploymentsFrozen: true, outboundIntegrationsFrozen: true, containsSecrets: false, containsCustomerRecords: false },
}

assert.equal(assessRentalStagingRecoveryAuthority(valid).ready, true)
assert.equal(assessRentalStagingRecoveryAuthority({ ...valid, stagingRecovery: { ...valid.stagingRecovery, recoveryMode: '' } }).ready, false)
assert.equal(assessRentalStagingRecoveryAuthority({ ...valid, stagingFreeze: { ...valid.stagingFreeze, deploymentsFrozen: false } }).ready, false)
assert.equal(assessRentalStagingRecoveryAuthority({ ...valid, stagingFreeze: { ...valid.stagingFreeze, projectRef: 'isdowlnollckzvltkasn' } }).ready, false)

console.log('Rental staging recovery-authority Phase 1 contract passed.')
