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
const phase6Script = read('scripts/bond-originator-phase6-post-launch-monitoring.mjs')
const phase6Audit = read('docs/audits/bond-originator-phase6-post-launch-monitoring.md')
const phase5Audit = read('docs/audits/bond-originator-phase5-final-signoff.md')
const launchReadiness = read('docs/phase-8-launch-readiness.md')
const envExample = read('.env.example')

assert.match(packageSource, /"test:bond-originator-phase6-post-launch-monitoring":\s*"node scripts\/bond-originator-phase6-post-launch-monitoring\.test\.mjs"/)
assert.match(packageSource, /"verify:bond-originator-phase6-post-launch-monitoring":\s*"node scripts\/bond-originator-phase6-post-launch-monitoring\.mjs"/)

for (const token of [
  'scripts/bond-originator-phase5-final-signoff.mjs',
  '--require-monitoring',
  '--require-final-signoff',
  'BOND_ORIGINATOR_PHASE6_MONITORING_RUN_ID',
  'BOND_ORIGINATOR_PHASE6_DASHBOARD_URL',
  'BOND_ORIGINATOR_PHASE6_CRITICAL_STUCK_FILE_THRESHOLD',
  'BOND_ORIGINATOR_PHASE6_ESCALATION_OWNER',
  'BOND_ORIGINATOR_PHASE6_REVIEW_APPROVER',
  'READY_LOCAL_MONITORING_PACKAGE',
  'READY_POST_LAUNCH_MONITORING',
]) {
  assertIncludes(phase6Script, token, `Phase 6 script should preserve ${token}.`)
}

for (const token of [
  'BOND_ORIGINATOR_PHASE6_MONITORING_RUN_ID=',
  'BOND_ORIGINATOR_PHASE6_MONITORING_OWNER=',
  'BOND_ORIGINATOR_PHASE6_MONITORING_STARTED_AT=',
  'BOND_ORIGINATOR_PHASE6_WATCH_WINDOW=',
  'BOND_ORIGINATOR_PHASE6_DASHBOARD_URL=',
  'BOND_ORIGINATOR_PHASE6_ALERT_CHANNEL_URL=',
  'BOND_ORIGINATOR_PHASE6_CRITICAL_STUCK_FILE_THRESHOLD=',
  'BOND_ORIGINATOR_PHASE6_WARNING_STUCK_FILE_THRESHOLD=',
  'BOND_ORIGINATOR_PHASE6_SLA_BREACH_THRESHOLD=',
  'BOND_ORIGINATOR_PHASE6_ESCALATION_OWNER=',
  'BOND_ORIGINATOR_PHASE6_INCIDENT_RUNBOOK_URL=',
  'BOND_ORIGINATOR_PHASE6_SUPPORT_HANDOVER_URL=',
  'BOND_ORIGINATOR_PHASE6_REVIEW_CADENCE=',
  'BOND_ORIGINATOR_PHASE6_REVIEW_APPROVER=',
]) {
  assertIncludes(envExample, token, `.env.example should declare ${token}.`)
}

assert.match(phase6Audit, /# Bond Originator Phase 6 Post-Launch Monitoring/)
assert.match(phase6Audit, /## Monitoring Evidence/)
assert.match(phase6Audit, /## Alert Semantics/)
assert.match(phase6Audit, /npm run verify:bond-originator-phase6-post-launch-monitoring/)
assert.match(phase6Audit, /node scripts\/bond-originator-phase6-post-launch-monitoring\.mjs --require-monitoring/)
assert.match(phase6Audit, /Decision: PHASE 6 HARNESS IMPLEMENTED; POST-LAUNCH MONITORING EVIDENCE REQUIRED/)

assert.match(phase5Audit, /Decision: PHASE 5 HARNESS IMPLEMENTED; FINAL SIGN-OFF EVIDENCE REQUIRED BEFORE PRODUCTION GO/)
assert.match(phase5Audit, /Phase 6 owns the post-launch monitoring/)

assert.match(launchReadiness, /Bond originator Phase 6 post-launch monitoring: `docs\/audits\/bond-originator-phase6-post-launch-monitoring\.md`/)
assert.match(launchReadiness, /npm run verify:bond-originator-phase6-post-launch-monitoring/)
assert.match(launchReadiness, /node scripts\/bond-originator-phase6-post-launch-monitoring\.mjs --require-monitoring/)

const staticGate = spawnSync(
  process.execPath,
  ['scripts/bond-originator-phase6-post-launch-monitoring.mjs', '--static-only'],
  { cwd: projectRoot, encoding: 'utf8' },
)

assert.equal(staticGate.status, 0, staticGate.stderr || staticGate.stdout)
const staticReport = JSON.parse(staticGate.stdout)
assert.equal(staticReport.summary.status, 'READY_STATIC_ONLY')
assert.equal(staticReport.summary.staticBlockedCount, 0)
assert.equal(staticReport.commands.every((command) => command.status === 'SKIPPED'), true)
assert.equal(staticReport.monitoringEvidence.every((item) => item.status === 'PENDING'), true)

console.log('bond originator Phase 6 post-launch monitoring tests passed')
