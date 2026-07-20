#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = 'migration-evidence/2026-07-20-production-phase24-attorney-identity-access'
const summary = JSON.parse(readFileSync(`${root}/batch-summary.json`, 'utf8'))
const remediation = JSON.parse(readFileSync(`${root}/assignment-remediation.json`, 'utf8'))
const manifest = JSON.parse(readFileSync('docs/supabase-phase-5-application-manifest.json', 'utf8'))
const readiness = JSON.parse(readFileSync('docs/supabase-phase-7-staging-readiness.json', 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
const scope = JSON.parse(readFileSync('docs/phase-18-phase-1-release-scope.json', 'utf8'))
const requested = ['202607180037', '202607180038', '202607180039', '202607180040', '202607180041', '202607180042']
const corrective = ['202607209901', '202607209902']
const promoted = [corrective[0], ...requested.slice(0, 3), corrective[1], ...requested.slice(3)]

assert.equal(summary.status, 'PRODUCTION_PHASE_24_COMPLETE')
assert.deepEqual(summary.requestedVersions, requested)
assert.deepEqual(summary.correctiveVersions, corrective)
assert.equal(summary.productionLedgerCountBefore, 481)
assert.equal(summary.productionLedgerCountAfter, 489)
assert.equal(summary.phase24LedgerRows, 8)
assert.equal(summary.closeoutEvidenceComplete, 56)
assert.equal(summary.closeoutEvidenceTotal, 70)
assert.equal(summary.remainingProductionPromotions, 14)
assert.equal(summary.remediatedAssignments, 43)
assert.equal(summary.remediationAuditEvents, 43)
assert.equal(summary.blockingIntegrityRows, 0)
assert.equal(summary.ineligibleOpenAssignments, 0)
assert.equal(summary.phase0FreezeRemainsActive, true)

assert.equal(remediation.updatedAssignmentCount, 43)
assert.equal(remediation.distinctTransactionCount, 43)
assert.equal(remediation.auditEventCount, 43)
assert.equal(remediation.attorneyIntegrityBlockingRowsAfter, 0)
assert.equal(remediation.attorneyIntegrityBlockingAssignmentsAfter, 0)
assert.equal(remediation.transactionalPostconditionsPassed, true)

for (const version of promoted) {
  const evidence = JSON.parse(readFileSync(`${root}/${version}.json`, 'utf8'))
  assert.equal(evidence.targetProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(evidence.targetStateVerified, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.equal(evidence.rollbackOrNoResidue, 'pass')
  assert.ok(closeout.rows.some((row) => row.version === version && row.productionLedgerRecorded === true))
}

assert.ok(manifest.rows.length >= 70)
assert.ok(readiness.manifestRowCount >= 70)
assert.ok(readiness.stagingLedgerRecordedCount >= 70)
assert.equal(readiness.certificationStatus, 'STAGING_CERTIFIED')
assert.equal(closeout.rows.filter((row) => row.productionLedgerRecorded === true).length, 56)
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
assert.equal(scope.productionBaseline.reviewedProductionPromotions, 56)
assert.equal(scope.productionBaseline.outstandingManifestRows, 14)
assert.equal(scope.productionBaseline.productionLedgerRows, 489)

console.log('Phase 24 attorney identity/access promotion passed: 8 ledger entries, 43 remediations and 0 integrity blockers.')
