#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = 'migration-evidence/2026-07-20-production-phase23-document-generation'
const summary = JSON.parse(readFileSync(`${root}/batch-summary.json`, 'utf8'))
const manifest = JSON.parse(readFileSync('docs/supabase-phase-5-application-manifest.json', 'utf8'))
const readiness = JSON.parse(readFileSync('docs/supabase-phase-7-staging-readiness.json', 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
const functionDeployment = JSON.parse(readFileSync('deployment-evidence/2026-07-20-phase23/resolve-signer-token-public-surface.json', 'utf8'))
const requested = ['202607170029', '202607170030', '202607170031', '202607180023', '202607180033', '202607180034', '202607180048', '202607180049', '202607180050', '202607180051', '202607180052']
const promoted = [...requested, '202607200007']

assert.equal(summary.status, 'PRODUCTION_PHASE_23_COMPLETE')
assert.deepEqual(summary.requestedVersions, requested)
assert.deepEqual(summary.correctiveVersions, ['202607200007'])
assert.equal(summary.productionLedgerCountBefore, 469)
assert.equal(summary.productionLedgerCountAfter, 481)
assert.equal(summary.closeoutEvidenceComplete, 48)
assert.equal(summary.closeoutEvidenceTotal, 68)
assert.equal(summary.remainingProductionPromotions, 20)
assert.equal(summary.directPipelineWriteGrantCount, 0)
assert.equal(summary.serviceEvidenceClientGrantCount, 0)
assert.equal(summary.phase0FreezeRemainsActive, true)
assert.equal(summary.publicSignerSurface.internalRenderedFilePathRemoved, true)
assert.equal(functionDeployment.status, 'PUBLIC_SIGNER_SURFACE_HARDENED')
assert.equal(functionDeployment.stagingDeployment, 'pass')
assert.equal(functionDeployment.productionDeployment, 'pass')
assert.equal(functionDeployment.productionInvalidTokenProbe.errorCode, 'INVALID_SIGNING_TOKEN')
assert.equal(functionDeployment.databaseMutatedByFunctionDeployment, false)

for (const version of promoted) {
  const evidence = JSON.parse(readFileSync(`${root}/${version}.json`, 'utf8'))
  assert.equal(evidence.targetProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(evidence.sqlApplied, true)
  assert.equal(evidence.targetStateVerified, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.equal(evidence.rollbackOrNoResidue, 'pass')
  assert.ok(closeout.rows.some((row) => row.version === version && row.productionLedgerRecorded === true))
}

assert.ok(manifest.rows.length >= 68)
assert.ok(readiness.manifestRowCount >= 68)
assert.equal(readiness.stagingLedgerRecordedCount, 68)
assert.equal(readiness.certificationStatus, 'STAGING_CERTIFIED')
assert.equal(manifest.rows.find((row) => row.version === '202607180049')?.dependsOn, '202607200007')
assert.equal(new Set(manifest.rows.map((row) => row.version)).size, manifest.rows.length)
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
assert.equal(closeout.rows.filter((row) => row.productionLedgerRecorded === true).length, 48)

console.log('Phase 23 document-generation promotion tests passed: 12 production migrations verified and 20 governed rows remain.')
