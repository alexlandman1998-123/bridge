#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('docs/supabase-phase-5-application-manifest.json', 'utf8'))
const readiness = JSON.parse(readFileSync('docs/supabase-phase-7-staging-readiness.json', 'utf8'))
const scope = JSON.parse(readFileSync('docs/phase-18-phase-1-release-scope.json', 'utf8'))
const expansion = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase22/staging-inventory-expansion.json', 'utf8'))
const certificationPath = 'migration-evidence/2026-07-20-staging-phase22/staging-release-certification.json'
const certification = JSON.parse(readFileSync(certificationPath, 'utf8'))
const versions = ['202607200004', '202607200005', '202607200006']

assert.ok(manifest.rows.length >= 67)
assert.deepEqual(versions.map((version) => manifest.rows.find((row) => row.version === version)?.version), versions)
assert.match(certification.manifestSha256, /^[0-9a-f]{64}$/)

for (const version of versions) {
  const evidence = JSON.parse(readFileSync(`migration-evidence/2026-07-20-staging-phase22/${version}.json`, 'utf8'))
  assert.equal(evidence.targetProjectRef, 'vaszuxjeoajeuhlcnzzf')
  assert.equal(evidence.sqlApplied, true)
  assert.equal(evidence.stagingLedgerRecorded, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.equal(evidence.rollbackOrNoResidue, 'pass')
  assert.equal(evidence.productionMutated, false)
}

assert.equal(expansion.status, 'STAGING_INVENTORY_RECERTIFIED')
assert.deepEqual(expansion.versions, versions)
assert.equal(expansion.manifestRowsAfter, 67)
assert.equal(expansion.stagingLedgerRowsAfter, 500)
assert.equal(expansion.stagingCertified, true)
assert.equal(expansion.productionMutated, false)
assert.equal(expansion.phase0MigrationFreezeRemainsActive, true)

assert.equal(certification.status, 'STAGING_CERTIFIED')
assert.equal(certification.manifestRowCount, 67)
assert.equal(certification.stagingEvidenceCount, 67)
assert.equal(certification.ledgerRecordedCount, 67)
assert.equal(certification.attorneyIntegrity.blockingAssignments, 0)
assert.equal(certification.phase10AuditEventCount, 43)
assert.equal(certification.productionMutated, false)
assert.doesNotThrow(() => execFileSync('git', ['cat-file', '-e', `${certification.releaseCommit}^{commit}`]))
assert.doesNotThrow(() => execFileSync('git', ['merge-base', '--is-ancestor', certification.releaseCommit, 'HEAD']))

assert.ok(readiness.manifestRowCount >= certification.manifestRowCount)
assert.ok(readiness.stagingLedgerRecordedCount >= certification.ledgerRecordedCount)
assert.equal(readiness.certificationStatus, 'STAGING_CERTIFIED')
assert.equal(scope.pendingConditionalMasterInventory.stagingCertificationStatus, 'certified')

console.log('Phase 22 historical staging certificate remains valid: 67/67 migrations certified and production unchanged.')
