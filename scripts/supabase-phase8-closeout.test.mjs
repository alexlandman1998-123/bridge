#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'supabase-phase8-closeout.mjs')

function run(args) {
  return spawnSync(process.execPath, [runner, ...args], { cwd: repoRoot, encoding: 'utf8' })
}

const plan = run(['--plan', '--json'])
assert.equal(plan.status, 0, plan.stderr)
const result = JSON.parse(plan.stdout)
assert.equal(result.status, 'LOCAL_CLOSEOUT_NOT_READY')
assert.equal(result.readyForFreezeRetirement, false)
assert.equal(result.manifestRowCount, 70)
assert.equal(result.duplicateVersions.length, 0)
assert.equal(result.missingManifestFiles.length, 0)
assert.equal(result.phase7Readiness.status, 'READY_FOR_PRODUCTION_PROMOTION')
assert.equal(result.phase7Readiness.ready, true)
assert.equal(result.phase7Readiness.attorneyIntegrityGate, 'pass')
assert.equal(result.phase7Readiness.attorneyIntegrityBlockingAssignments, 0)
assert.equal(result.phase7Readiness.approved, true)
assert.equal(result.evidence.complete.length + result.evidence.incomplete.length, 70)
assert.equal(result.evidence.duplicates.length, 0)
assert.equal(result.recoveryEvidence.valid, true)
assert.equal(result.recoveryEvidence.approvedBy, 'Alexander Landman')
assert.equal(result.live, null)

const unknown = run(['--not-a-real-option'])
assert.equal(unknown.status, 1)
assert.match(unknown.stderr, /Unknown argument/)

console.log('Supabase Phase 8 closeout tests passed.')
