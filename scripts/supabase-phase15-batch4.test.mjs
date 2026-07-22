#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const versions = ['202607180006','202607180007','202607180008','202607180009','202607180010','202607180011','202607180012','202607180013']
const root = 'migration-evidence/2026-07-20-production-phase15-batch4'
const summary = JSON.parse(readFileSync(`${root}/batch-summary.json`, 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
assert.equal(summary.status, 'PRODUCTION_BATCH_4_COMPLETE')
assert.deepEqual(summary.versions, versions)
assert.equal(summary.productionLedgerCountAfter, 459)
assert.equal(summary.closeoutEvidenceComplete, 26)
for (const version of versions) {
  const evidence = JSON.parse(readFileSync(`${root}/${version}.json`, 'utf8'))
  assert.equal(evidence.targetProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(evidence.targetStateVerified, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.ok(closeout.rows.some((row) => row.version === version && row.productionLedgerRecorded))
}
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
console.log('Phase 15 Batch 4 production evidence tests passed.')
