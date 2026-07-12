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
const phase5Script = read('scripts/bond-originator-phase5-final-signoff.mjs')
const phase5Audit = read('docs/audits/bond-originator-phase5-final-signoff.md')
const phase4Audit = read('docs/audits/bond-originator-phase4-staging-sweep.md')
const launchReadiness = read('docs/phase-8-launch-readiness.md')
const envExample = read('.env.example')

assert.match(packageSource, /"test:bond-originator-phase5-final-signoff":\s*"node scripts\/bond-originator-phase5-final-signoff\.test\.mjs"/)
assert.match(packageSource, /"verify:bond-originator-phase5-final-signoff":\s*"node scripts\/bond-originator-phase5-final-signoff\.mjs"/)

for (const token of [
  'scripts/bond-originator-phase4-staging-sweep.mjs',
  '--require-final-signoff',
  '--require-live-evidence',
  'BOND_ORIGINATOR_PHASE5_SIGNOFF_APPROVER',
  'BOND_ORIGINATOR_PHASE5_SIGNOFF_APPROVED_AT',
  'BOND_ORIGINATOR_PHASE5_RELEASE_NOTES_URL',
  'BOND_ORIGINATOR_PHASE5_RESIDUAL_RISK_OWNER',
  'BOND_ORIGINATOR_PHASE5_REMEDIATION_OWNER',
  'BOND_ORIGINATOR_PHASE5_ROLLBACK_OWNER',
  'BOND_ORIGINATOR_PHASE5_SUPPORT_OWNER',
  'BOND_ORIGINATOR_PHASE5_MONITORING_CHECKLIST_URL',
  'READY_LOCAL_SIGNOFF_PACKAGE',
  'READY_FINAL_SIGNOFF',
]) {
  assertIncludes(phase5Script, token, `Phase 5 script should preserve ${token}.`)
}

for (const token of [
  'BOND_ORIGINATOR_PHASE5_SIGNOFF_APPROVER=',
  'BOND_ORIGINATOR_PHASE5_SIGNOFF_APPROVED_AT=',
  'BOND_ORIGINATOR_PHASE5_RELEASE_NOTES_URL=',
  'BOND_ORIGINATOR_PHASE5_RESIDUAL_RISK_REGISTER_URL=',
  'BOND_ORIGINATOR_PHASE5_RESIDUAL_RISK_OWNER=',
  'BOND_ORIGINATOR_PHASE5_REMEDIATION_OWNER=',
  'BOND_ORIGINATOR_PHASE5_REMEDIATION_PLAYBOOK_URL=',
  'BOND_ORIGINATOR_PHASE5_ROLLBACK_OWNER=',
  'BOND_ORIGINATOR_PHASE5_ROLLBACK_PLAN_URL=',
  'BOND_ORIGINATOR_PHASE5_SUPPORT_OWNER=',
  'BOND_ORIGINATOR_PHASE5_SUPPORT_PLAYBOOK_URL=',
  'BOND_ORIGINATOR_PHASE5_MONITORING_OWNER=',
  'BOND_ORIGINATOR_PHASE5_MONITORING_CHECKLIST_URL=',
  'BOND_ORIGINATOR_PHASE5_POST_LAUNCH_WATCH_WINDOW=',
]) {
  assertIncludes(envExample, token, `.env.example should declare ${token}.`)
}

assert.match(phase5Audit, /# Bond Originator Phase 5 Final Sign-Off/)
assert.match(phase5Audit, /## Final Sign-Off Evidence/)
assert.match(phase5Audit, /## Status Semantics/)
assert.match(phase5Audit, /npm run verify:bond-originator-phase5-final-signoff/)
assert.match(phase5Audit, /node scripts\/bond-originator-phase5-final-signoff\.mjs --require-final-signoff/)
assert.match(phase5Audit, /Decision: PHASE 5 HARNESS IMPLEMENTED; FINAL SIGN-OFF EVIDENCE REQUIRED BEFORE PRODUCTION GO/)

assert.match(phase4Audit, /Decision: PHASE 4 HARNESS IMPLEMENTED; STRICT LIVE STAGING SWEEP REQUIRED/)
assert.match(phase4Audit, /Phase 5 owns the final sign-off package/)

assert.match(launchReadiness, /Bond originator Phase 5 final sign-off: `docs\/audits\/bond-originator-phase5-final-signoff\.md`/)
assert.match(launchReadiness, /npm run verify:bond-originator-phase5-final-signoff/)
assert.match(launchReadiness, /node scripts\/bond-originator-phase5-final-signoff\.mjs --require-final-signoff/)

const staticGate = spawnSync(
  process.execPath,
  ['scripts/bond-originator-phase5-final-signoff.mjs', '--static-only'],
  { cwd: projectRoot, encoding: 'utf8' },
)

assert.equal(staticGate.status, 0, staticGate.stderr || staticGate.stdout)
const staticReport = JSON.parse(staticGate.stdout)
assert.equal(staticReport.summary.status, 'READY_STATIC_ONLY')
assert.equal(staticReport.summary.staticBlockedCount, 0)
assert.equal(staticReport.commands.every((command) => command.status === 'SKIPPED'), true)
assert.equal(staticReport.signoffEvidence.every((item) => item.status === 'PENDING'), true)

console.log('bond originator Phase 5 final sign-off tests passed')
