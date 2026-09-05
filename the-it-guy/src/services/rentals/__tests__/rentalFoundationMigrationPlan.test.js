import assert from 'node:assert/strict'
import {
  assessRentalFoundationMigrationPlan,
  RENTAL_FOUNDATION_MIGRATION_SOURCES,
} from '../rentalFoundationMigrationPlan.js'

const blocked = assessRentalFoundationMigrationPlan({
  evidence: {},
  sourceFiles: RENTAL_FOUNDATION_MIGRATION_SOURCES,
})

assert.equal(blocked.status, 'BLOCKED_PENDING_RECOVERY_EVIDENCE')
assert.equal(blocked.generationAllowed, false)
assert.equal(blocked.applyAllowed, false)
assert.equal(blocked.missingEvidence.length, 4)

const evidence = {
  productionLedger: { confirmed: true, reference: 'ledger-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'a'.repeat(64)}`, containsSecrets: false, containsCustomerRecords: false },
  productionCatalog: { confirmed: true, reference: 'catalog-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'b'.repeat(64)}`, containsSecrets: false, containsCustomerRecords: false },
  stagingRecovery: { confirmed: true, reference: 'recovery-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', recoveryMode: 'disposable', containsSecrets: false, containsCustomerRecords: false },
  stagingFreeze: { confirmed: true, reference: 'freeze-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', deploymentsFrozen: true, outboundIntegrationsFrozen: true, containsSecrets: false, containsCustomerRecords: false },
}

const readyForAuthoring = assessRentalFoundationMigrationPlan({
  evidence,
  sourceFiles: RENTAL_FOUNDATION_MIGRATION_SOURCES,
})

assert.equal(readyForAuthoring.status, 'READY_FOR_MANAGED_MIGRATION_AUTHORING_ONLY')
assert.equal(readyForAuthoring.generationAllowed, true)
assert.equal(readyForAuthoring.applyAllowed, false)

const orderMismatch = assessRentalFoundationMigrationPlan({
  evidence,
  sourceFiles: [...RENTAL_FOUNDATION_MIGRATION_SOURCES].reverse(),
})

assert.equal(orderMismatch.sourceOrderMatches, false)
assert.equal(orderMismatch.generationAllowed, false)
assert.equal(orderMismatch.applyAllowed, false)

console.log('Rental foundation migration-plan Phase 3 contract passed.')
