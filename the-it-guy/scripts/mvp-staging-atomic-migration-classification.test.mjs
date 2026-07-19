import assert from 'node:assert/strict'
import fs from 'node:fs'

const evidence = JSON.parse(
  fs.readFileSync('docs/audits/mvp-staging-atomic-migration-classification-2026-07-19.json', 'utf8'),
)

assert.equal(evidence.migration.version, '202607180046')
assert.equal(evidence.migration.presentInStagingLedger, false)
assert.equal(evidence.classification.status, 'absent_and_not_standalone_safe')
assert.equal(evidence.classification.isLedgerOnlyGap, false)
assert.equal(evidence.classification.isSupersededByLaterMigration, false)
assert.equal(evidence.classification.isSafeToApplyUnchangedToStaging, false)
assert.equal(evidence.stagingEvidence.atomicRpc.code, 'PGRST202')
assert.equal(evidence.stagingEvidence.externalColumnReferencedBy046.column, 'transactions.mandate_packet_id')
assert.equal(evidence.stagingEvidence.externalColumnReferencedBy046.presentInStaging, false)
assert.equal(evidence.stagingEvidence.externalColumnReferencedBy046.createdBy046, false)
assert.equal(evidence.decision, 'prepare_a_new_reconciliation_migration_not_a_historical_push')
assert.match(evidence.scope, /No migration, transaction, notification, user, document, or database record was created, updated, or deleted/)

console.log('mvp-staging-atomic-migration-classification: passed')
