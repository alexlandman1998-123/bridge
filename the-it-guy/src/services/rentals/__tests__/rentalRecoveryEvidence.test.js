import assert from 'node:assert/strict'
import { assessRentalRecoveryEvidence } from '../rentalRecoveryEvidence.js'

const valid = {
  productionLedger: { confirmed: true, reference: 'ledger-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'a'.repeat(64)}`, containsSecrets: false, containsCustomerRecords: false },
  productionCatalog: { confirmed: true, reference: 'catalog-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'b'.repeat(64)}`, containsSecrets: false, containsCustomerRecords: false },
  stagingRecovery: { confirmed: true, reference: 'recovery-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', recoveryMode: 'snapshot', containsSecrets: false, containsCustomerRecords: false },
  stagingFreeze: { confirmed: true, reference: 'freeze-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', deploymentsFrozen: true, outboundIntegrationsFrozen: true, containsSecrets: false, containsCustomerRecords: false },
}

assert.equal(assessRentalRecoveryEvidence(valid).ready, true)
assert.equal(assessRentalRecoveryEvidence({ ...valid, productionLedger: { ...valid.productionLedger, projectRef: 'vaszuxjeoajeuhlcnzzf' } }).ready, false)
assert.equal(assessRentalRecoveryEvidence({ ...valid, productionCatalog: { ...valid.productionCatalog, containsSecrets: true } }).ready, false)
assert.equal(assessRentalRecoveryEvidence({ ...valid, stagingFreeze: { ...valid.stagingFreeze, outboundIntegrationsFrozen: false } }).ready, false)

console.log('Rental recovery evidence Phase 4 contract passed.')
