#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const versions = ['202607180014','202607180015','202607180016','202607180017','202607180018','202607180019','202607180020','202607180021','202607180022']
const root = 'migration-evidence/2026-07-20-production-phase15-batch5'
const summary = JSON.parse(readFileSync(`${root}/batch-summary.json`, 'utf8'))
const closeout = JSON.parse(readFileSync('docs/supabase-phase-8-closeout-evidence.json', 'utf8'))
assert.equal(summary.status, 'PRODUCTION_BATCH_5_COMPLETE')
assert.deepEqual(summary.versions, versions)
assert.equal(summary.productionLedgerCountAfter, 468)
assert.equal(summary.closeoutEvidenceComplete, 35)
for (const version of versions) {
  const evidence = JSON.parse(readFileSync(`${root}/${version}.json`, 'utf8'))
  assert.equal(evidence.targetProjectRef, 'isdowlnollckzvltkasn')
  assert.equal(evidence.targetStateVerified, true)
  assert.equal(evidence.catalogChecks, 'pass')
  assert.equal(evidence.behaviorChecks, 'pass')
  assert.ok(closeout.rows.some((row) => row.version === version && row.productionLedgerRecorded))
}
assert.equal(new Set(closeout.rows.map((row) => row.version)).size, closeout.rows.length)
console.log('Phase 15 Batch 5 production evidence tests passed.')
