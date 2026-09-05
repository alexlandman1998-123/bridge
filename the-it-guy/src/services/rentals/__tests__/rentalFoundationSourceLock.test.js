import assert from 'node:assert/strict'
import { RENTAL_FOUNDATION_MIGRATION_SOURCES } from '../rentalFoundationMigrationPlan.js'
import { assessRentalFoundationSourceLock } from '../rentalFoundationSourceLock.js'

const evidence = {
  productionLedger: { confirmed: true, reference: 'ledger-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'a'.repeat(64)}`, containsSecrets: false, containsCustomerRecords: false },
  productionCatalog: { confirmed: true, reference: 'catalog-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'isdowlnollckzvltkasn', artifactSha256: `sha256:${'b'.repeat(64)}`, containsSecrets: false, containsCustomerRecords: false },
  stagingRecovery: { confirmed: true, reference: 'recovery-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', recoveryMode: 'disposable', containsSecrets: false, containsCustomerRecords: false },
  stagingFreeze: { confirmed: true, reference: 'freeze-ref', recordedAt: '2026-09-05T12:00:00.000Z', projectRef: 'vaszuxjeoajeuhlcnzzf', deploymentsFrozen: true, outboundIntegrationsFrozen: true, containsSecrets: false, containsCustomerRecords: false },
}
const entries = RENTAL_FOUNDATION_MIGRATION_SOURCES.map((path, index) => ({ path, sha256: `sha256:${index.toString(16).padStart(64, '0')}` }))
const locked = assessRentalFoundationSourceLock({ evidence, sourceEntries: entries, chainSha256: `sha256:${'c'.repeat(64)}` })

assert.equal(locked.status, 'READY_FOR_REVIEWED_MANAGED_MIGRATION_AUTHORING_ONLY')
assert.equal(locked.authoringAllowed, true)
assert.equal(locked.applyAllowed, false)
assert.equal(assessRentalFoundationSourceLock({ evidence, sourceEntries: [...entries].reverse(), chainSha256: `sha256:${'c'.repeat(64)}` }).authoringAllowed, false)
assert.equal(assessRentalFoundationSourceLock({ evidence: {}, sourceEntries: entries, chainSha256: `sha256:${'c'.repeat(64)}` }).authoringAllowed, false)

console.log('Rental foundation source-lock Phase 5 contract passed.')
