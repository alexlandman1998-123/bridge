#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = 'migration-evidence/2026-07-20-production-phase31-migration-closeout'
const versions = ['202607200004', '202607200005', '202607200006']
const summary = JSON.parse(readFileSync(`${root}/batch-summary.json`, 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
const scope = JSON.parse(readFileSync('docs/phase-18-phase-1-release-scope.json', 'utf8'))

assert.equal(summary.status, 'PRODUCTION_PHASE_31_COMPLETE')
assert.deepEqual(summary.requestedVersions, versions)
assert.equal(summary.productionProjectRef, 'isdowlnollckzvltkasn')
assert.equal(summary.productionLedgerCountBefore, 501)
assert.equal(summary.productionLedgerCountAfter, 504)
assert.equal(summary.phase31LedgerRows, 3)
assert.equal(summary.closeoutEvidenceComplete, 71)
assert.equal(summary.closeoutEvidenceTotal, 71)
assert.equal(summary.remainingGovernedProductionPromotions, 0)
assert.equal(summary.organisationRolloutActivated, false)

for (const version of versions) {
  const evidence = JSON.parse(readFileSync(`${root}/${version}.json`, 'utf8'))
  assert.equal(evidence.targetProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(evidence.sqlApplied, true)
  assert.equal(evidence.targetStateVerified, true)
  assert.equal(evidence.productionLedgerRecorded, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.equal(evidence.rollbackOrNoResidue, 'pass')
  assert.ok(closeout.rows.some((row) => row.version === version && row.productionLedgerRecorded === true))
}

const phase4 = JSON.parse(readFileSync(`${root}/202607200004.json`, 'utf8'))
assert.equal(phase4.verification.publishedV2GlobalMasters, 2)
assert.equal(phase4.verification.mandateConditionalSections, 6)
assert.equal(phase4.verification.otpConditionalSections, 13)
assert.equal(phase4.verification.invalidSections, 0)

const phase10 = JSON.parse(readFileSync(`${root}/202607200005.json`, 'utf8'))
assert.equal(phase10.verification.lifecycleFunctionCount, 4)
assert.equal(phase10.verification.migrationAuditRows, 0)
assert.equal(phase10.verification.invalidPacketTypeSqlstate, '22023')

const phase11 = JSON.parse(readFileSync(`${root}/202607200006.json`, 'utf8'))
assert.equal(phase11.verification.securityDefinerFunctionCount, 1)
assert.equal(phase11.verification.anonymousExecuteRevoked, true)
assert.equal(phase11.verification.verificationReceiptRows, 0)
assert.equal(phase11.verification.missingMigrationSqlstate, 'P0001')

assert.ok(closeout.rows.filter((row) => row.productionLedgerRecorded === true).length >= 71)
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
assert.match(scope.status, /^PHASE_1_SCOPE_AMENDED_PHASE_\d+$/)
assert.ok(scope.productionBaseline.reviewedProductionPromotions >= 71)
assert.equal(scope.productionBaseline.outstandingManifestRows, 0)
assert.ok(scope.productionBaseline.productionLedgerRows >= 504)
assert.equal(scope.completedPhase31ConditionalLegalMasters.status, 'production_promoted_and_verified')
assert.equal(scope.pendingConditionalMasterInventory.requiredAction, 'complete')
assert.equal(scope.changeControl.phase0MigrationFreezeRemainsActive, true)

console.log('Phase 31 migration closeout passed: 3/3 final migrations live, ledger 504, and governed evidence 71/71.')
