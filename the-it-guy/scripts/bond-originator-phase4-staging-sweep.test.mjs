#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function assertIncludes(source, expected, message) {
  assert.equal(source.includes(expected), true, message)
}

const packageSource = read('package.json')
const phase4Script = read('scripts/bond-originator-phase4-staging-sweep.mjs')
const phase4Audit = read('docs/audits/bond-originator-phase4-staging-sweep.md')
const phase3Audit = read('docs/audits/bond-originator-phase3-launch-gate.md')
const launchReadiness = read('docs/phase-8-launch-readiness.md')
const envExample = read('.env.example')

assert.match(packageSource, /"test:bond-originator-phase4-staging-sweep":\s*"node scripts\/bond-originator-phase4-staging-sweep\.test\.mjs"/)
assert.match(packageSource, /"verify:bond-originator-phase4-staging-sweep":\s*"node scripts\/bond-originator-phase4-staging-sweep\.mjs"/)

for (const token of [
  "STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'",
  'scripts/bond-originator-phase3-launch-gate.mjs',
  'scripts/bond-originator-stuck-file-sweep.mjs',
  '--live',
  '--confirm-staging',
  '--require-live',
  'BOND_ORIGINATOR_PHASE4_STAGING_RUN_ID',
  'BOND_ORIGINATOR_PHASE4_SWEEP_APPROVER',
  'BOND_ORIGINATOR_PHASE4_SWEEP_APPROVED_AT',
  'BOND_ORIGINATOR_PHASE4_RELEASE_NOTES_URL',
  'BOND_ORIGINATOR_PHASE4_REMEDIATION_OWNER',
  'BOND_ORIGINATOR_PHASE4_MONITORING_OWNER',
  'READY_LOCAL_CONTRACT',
  'READY_LIVE_WITH_WARNINGS',
]) {
  assertIncludes(phase4Script, token, `Phase 4 script should preserve ${token}.`)
}

for (const token of [
  'BOND_ORIGINATOR_PHASE4_SUPABASE_PROJECT_REF=',
  'BOND_ORIGINATOR_PHASE4_STAGING_RUN_ID=',
  'BOND_ORIGINATOR_PHASE4_SWEEP_APPROVER=',
  'BOND_ORIGINATOR_PHASE4_SWEEP_APPROVED_AT=',
  'BOND_ORIGINATOR_PHASE4_RELEASE_NOTES_URL=',
  'BOND_ORIGINATOR_PHASE4_REMEDIATION_OWNER=',
  'BOND_ORIGINATOR_PHASE4_MONITORING_OWNER=',
]) {
  assertIncludes(envExample, token, `.env.example should declare ${token}.`)
}

assert.match(phase4Audit, /# Bond Originator Phase 4 Staging Sweep/)
assert.match(phase4Audit, /## Staging Evidence Contract/)
assert.match(phase4Audit, /## Sweep Finding Semantics/)
assert.match(phase4Audit, /npm run verify:bond-originator-phase4-staging-sweep/)
assert.match(phase4Audit, /node scripts\/bond-originator-phase4-staging-sweep\.mjs --live --confirm-staging --require-live/)
assert.match(phase4Audit, /Decision: PHASE 4 HARNESS IMPLEMENTED; STRICT LIVE STAGING SWEEP REQUIRED/)

assert.match(phase3Audit, /Decision: GO TO STAGING SWEEP BEFORE RELEASE/)
assert.match(phase3Audit, /Phase 4 owns the strict staging evidence/)

assert.match(launchReadiness, /Bond originator Phase 4 staging sweep: `docs\/audits\/bond-originator-phase4-staging-sweep\.md`/)
assert.match(launchReadiness, /npm run verify:bond-originator-phase4-staging-sweep/)
assert.match(launchReadiness, /node scripts\/bond-originator-phase4-staging-sweep\.mjs --live --confirm-staging --require-live/)

const staticGate = spawnSync(
  process.execPath,
  ['scripts/bond-originator-phase4-staging-sweep.mjs', '--static-only'],
  { cwd: projectRoot, encoding: 'utf8' },
)

assert.equal(staticGate.status, 0, staticGate.stderr || staticGate.stdout)
const staticReport = JSON.parse(staticGate.stdout)
assert.equal(staticReport.summary.status, 'READY_STATIC_ONLY')
assert.equal(staticReport.summary.staticBlockedCount, 0)
assert.equal(staticReport.commands.every((command) => command.status === 'SKIPPED'), true)
assert.equal(staticReport.live.checks.some((check) => check.status === 'PENDING'), true)

console.log('bond originator Phase 4 staging sweep tests passed')
