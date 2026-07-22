#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const versions = ['202607170016', '202607170017', '202607170018', '202607170019', '202607170020', '202607170022', '202607170023', '202607170024']
const evidenceRoot = 'migration-evidence/2026-07-20-production-phase15-batch2'
const summary = JSON.parse(readFileSync(`${evidenceRoot}/batch-summary.json`, 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))

assert.equal(summary.status, 'PRODUCTION_BATCH_2_COMPLETE')
assert.equal(summary.productionProjectRef, 'isdowlnollckzvltkasn')
assert.deepEqual(summary.versions, versions)
assert.equal(summary.sqlAppliedCount, versions.length)
assert.equal(summary.productionLedgerRecordedCount, versions.length)
assert.equal(summary.productionLedgerCountBefore, 436)
assert.equal(summary.productionLedgerCountAfter, 444)
assert.equal(summary.catalogChecks, 'pass')
assert.equal(summary.behaviorChecks, 'pass')
assert.equal(summary.rollbackOrNoResidue, 'pass')

for (const version of versions) {
  const evidence = JSON.parse(readFileSync(`${evidenceRoot}/${version}.json`, 'utf8'))
  assert.equal(evidence.version, version)
  assert.equal(evidence.targetProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(evidence.sqlApplied, true)
  assert.equal(evidence.targetStateVerified, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.equal(evidence.rollbackOrNoResidue, 'pass')
  assert.ok(evidence.reviewedBy)
  const closeoutRow = closeout.rows.find((row) => row.version === version)
  assert.ok(closeoutRow)
  assert.equal(closeoutRow.stagingLedgerRecorded, true)
  assert.equal(closeoutRow.productionTargetStateVerified, true)
  assert.equal(closeoutRow.productionLedgerRecorded, true)
}

assert.ok(closeout.rows.length >= 11)
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
console.log('Phase 15 Batch 2 production evidence tests passed.')
