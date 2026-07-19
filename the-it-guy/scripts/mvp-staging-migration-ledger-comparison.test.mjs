import assert from 'node:assert/strict'
import fs from 'node:fs'

const evidence = JSON.parse(
  fs.readFileSync('docs/audits/mvp-staging-migration-ledger-comparison-2026-07-19.json', 'utf8'),
)

assert.equal(evidence.environment.supabaseProjectRef, 'isdowlnollckzvltkasn')
assert.equal(evidence.sources.repository.migrationFileCount, 494)
assert.equal(evidence.sources.stagingLedger.migrationCount, 431)
assert.equal(evidence.comparison.missingFromStagingCount, 63)
assert.equal(evidence.comparison.presentOnlyInStagingCount, 0)
assert.equal(evidence.atomicCreationMigration.version, '202607180046')
assert.equal(evidence.atomicCreationMigration.presentInStagingLedger, false)
assert.equal(evidence.orderingFinding.laterStagingMigrationsPresent, '202607190001–202607190006')
assert.equal(evidence.decision, 'migration_history_reconciliation_required')
assert.match(evidence.scope, /No migration, transaction, notification, user, document, or database record was created, updated, or deleted/)

console.log('mvp-staging-migration-ledger-comparison: passed')
