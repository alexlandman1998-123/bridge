import assert from 'node:assert/strict'
import { assessRentalReleaseEvidenceClearance } from '../rentalReleaseEvidenceClearance.js'

const valid = {
  productionLedger: { confirmed: true, reference: 'ledger-ref', recordedAt: '2026-09-05T13:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'a'.repeat(64)}`, readOnly: true, artifactKind: 'migration_ledger', containsSecrets: false, containsCustomerRecords: false },
  productionCatalog: { confirmed: true, reference: 'catalog-ref', recordedAt: '2026-09-05T13:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'b'.repeat(64)}`, readOnly: true, objectGroups: ['tables', 'functions', 'policies', 'triggers', 'indexes', 'storage'], containsSecrets: false, containsCustomerRecords: false },
  stagingRecovery: { confirmed: true, reference: 'snapshot-ref', recordedAt: '2026-09-05T13:00:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', recoveryMode: 'snapshot', containsSecrets: false, containsCustomerRecords: false },
  stagingFreeze: { confirmed: true, reference: 'freeze-ref', recordedAt: '2026-09-05T13:00:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', deploymentsFrozen: true, outboundIntegrationsFrozen: true, containsSecrets: false, containsCustomerRecords: false },
}

assert.equal(assessRentalReleaseEvidenceClearance(valid).ready, true)
assert.equal(assessRentalReleaseEvidenceClearance({ ...valid, stagingFreeze: { ...valid.stagingFreeze, deploymentsFrozen: false } }).ready, false)
assert.equal(assessRentalReleaseEvidenceClearance({ ...valid, productionLedger: { ...valid.productionLedger, artifactKind: '' } }).ready, false)
assert.equal(assessRentalReleaseEvidenceClearance(valid).applyAllowed, false)

console.log('Rental release evidence-clearance Phase 3 contract passed.')
