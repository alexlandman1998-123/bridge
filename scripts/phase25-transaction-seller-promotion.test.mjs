#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = 'migration-evidence/2026-07-20-production-phase25-transaction-seller'
const summary = JSON.parse(readFileSync(`${root}/batch-summary.json`, 'utf8'))
const advisory = JSON.parse(readFileSync(`${root}/rls-advisory.json`, 'utf8'))
const manifest = JSON.parse(readFileSync('docs/supabase-phase-5-application-manifest.json', 'utf8'))
const readiness = JSON.parse(readFileSync('docs/supabase-phase-7-staging-readiness.json', 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
const scope = JSON.parse(readFileSync('docs/phase-18-phase-1-release-scope.json', 'utf8'))
const promoted = ['202607209903', '202607180046', '20260719194500']

assert.equal(summary.status, 'PRODUCTION_PHASE_25_COMPLETE')
assert.deepEqual(summary.requestedVersions, ['202607180046', '20260719194500'])
assert.deepEqual(summary.correctiveVersions, ['202607209903'])
assert.equal(summary.productionLedgerCountBefore, 489)
assert.equal(summary.productionLedgerCountAfter, 492)
assert.equal(summary.phase25LedgerRows, 3)
assert.equal(summary.closeoutEvidenceComplete, 59)
assert.equal(summary.closeoutEvidenceTotal, 71)
assert.equal(summary.remainingProductionPromotions, 12)
assert.equal(summary.participantRequirementsAnonymousPrivileges, 0)
assert.equal(summary.participantRequirementsAuthenticatedAccess, 'select_only_through_rls')
assert.equal(summary.phase0FreezeRemainsActive, true)

for (const version of promoted) {
  const evidence = JSON.parse(readFileSync(`${root}/${version}.json`, 'utf8'))
  assert.equal(evidence.targetProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(evidence.targetStateVerified, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.equal(evidence.rollbackOrNoResidue, 'pass')
  assert.ok(closeout.rows.some((row) => row.version === version && row.productionLedgerRecorded === true))
}

assert.ok(manifest.rows.length >= 71)
assert.equal(readiness.manifestRowCount, manifest.rows.length)
assert.equal(readiness.stagingLedgerRecordedCount, manifest.rows.length)
assert.equal(readiness.certificationStatus, 'STAGING_CERTIFIED')
assert.ok(closeout.rows.filter((row) => row.productionLedgerRecorded === true).length >= 59)
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
assert.ok(scope.productionBaseline.reviewedProductionPromotions >= 59)
assert.ok(scope.productionBaseline.outstandingManifestRows <= 12)
assert.ok(scope.productionBaseline.productionLedgerRows >= 492)
assert.equal(advisory.status, 'REVIEW_REQUIRED_NO_AUTOMATIC_REMEDIATION')
assert.equal(advisory.rlsDisabledTables.length, 8)
assert.equal(advisory.databaseMutatedByAdvisoryCheck, false)

console.log('Phase 25 transaction and seller completion passed: 3 ledger entries and 12 governed promotions remain.')
