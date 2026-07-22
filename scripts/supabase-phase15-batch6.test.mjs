#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const versions = ['202607180043']
const root = 'migration-evidence/2026-07-20-production-phase15-batch6'
const summary = JSON.parse(readFileSync(`${root}/batch-summary.json`, 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
assert.equal(summary.status, 'PRODUCTION_BATCH_6_COMPLETE')
assert.deepEqual(summary.versions, versions)
assert.equal(summary.productionLedgerCountAfter, 469)
assert.equal(summary.closeoutEvidenceComplete, 36)
for (const version of versions) {
  const evidence = JSON.parse(readFileSync(`${root}/${version}.json`, 'utf8'))
  assert.equal(evidence.targetProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(evidence.targetStateVerified, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.equal(evidence.verification.unconfiguredAccessAllowed, false)
  assert.ok(closeout.rows.some((row) => row.version === version && row.productionLedgerRecorded))
}
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
console.log('Phase 15 Batch 6 production evidence tests passed.')
