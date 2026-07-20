#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = 'migration-evidence/2026-07-20-production-phase29-attorney-accounting'
const summary = JSON.parse(readFileSync(`${root}/batch-summary.json`, 'utf8'))
const prerequisite = JSON.parse(readFileSync(`${root}/prerequisite-repair.json`, 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
const scope = JSON.parse(readFileSync('docs/phase-18-phase-1-release-scope.json', 'utf8'))
const versions = ['202607180026', '202607180027', '202607180028', '202607180029', '202607180030', '202607180031', '202607180035', '202607180036']

assert.equal(summary.status, 'PRODUCTION_PHASE_29_COMPLETE')
assert.deepEqual(summary.requestedVersions, versions)
assert.equal(summary.productionProjectRef, 'isdowlnollckzvltkasn')
assert.equal(summary.productionLedgerCountBefore, 492)
assert.equal(summary.productionLedgerCountAfter, 500)
assert.equal(summary.phase29LedgerRows, 8)
assert.equal(summary.closeoutEvidenceComplete, 67)
assert.equal(summary.closeoutEvidenceTotal, 71)
assert.equal(summary.remainingProductionPromotions, 4)
assert.equal(summary.partyAccountsCreated, 318)
assert.equal(summary.bootstrapAuditEventsCreated, 318)
assert.equal(summary.nonZeroOpeningBalances, 0)
assert.equal(summary.financialDocumentsCreated, 0)
assert.equal(summary.financialEntriesCreated, 0)
assert.equal(summary.documentRequestsCreated, 0)
assert.equal(summary.phase0FreezeRemainsActive, true)

assert.equal(prerequisite.version, '202607180025')
assert.equal(prerequisite.ledgerChanged, false)
assert.equal(prerequisite.verification.canonicalTablesBefore, 0)
assert.equal(prerequisite.verification.canonicalTablesAfter, 4)
assert.equal(prerequisite.verification.rlsEnabledTables, 4)
assert.equal(prerequisite.verification.scopedPolicies, 11)

for (const version of versions) {
  const evidence = JSON.parse(readFileSync(`${root}/${version}.json`, 'utf8'))
  assert.equal(evidence.targetProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(evidence.sqlApplied, true)
  assert.equal(evidence.targetStateVerified, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.equal(evidence.rollbackOrNoResidue, 'pass')
  assert.ok(closeout.rows.some((row) => row.version === version && row.productionLedgerRecorded === true))
}

assert.equal(closeout.rows.filter((row) => row.productionLedgerRecorded === true).length, 67)
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
assert.equal(scope.status, 'PHASE_1_SCOPE_AMENDED_PHASE_29')
assert.equal(scope.productionBaseline.reviewedProductionPromotions, 67)
assert.equal(scope.productionBaseline.outstandingManifestRows, 4)
assert.equal(scope.productionBaseline.productionLedgerRows, 500)
assert.equal(scope.completedPhase29AttorneyAccounting.status, 'production_promoted_and_verified')
assert.equal(scope.deferredExistingManifestCount, 1)

console.log('Phase 29 attorney-accounting promotion passed: 8/8 migrations live, 500 ledger rows, and no monetary values imported.')
