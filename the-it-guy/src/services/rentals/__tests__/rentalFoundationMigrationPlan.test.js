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

const evidence = Object.fromEntries([
  'productionLedger',
  'productionCatalog',
  'stagingRecovery',
  'stagingFreeze',
].map((key) => [key, { confirmed: true, reference: `${key}-reference`, recordedAt: '2026-09-05T12:00:00.000Z' }]))

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
